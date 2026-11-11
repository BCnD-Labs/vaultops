import { beforeEach, describe, expect, it } from "vitest";
import { type Host, HostError, type HostErrorCode } from "./host";

async function expectCode(promise: Promise<unknown>, code: HostErrorCode) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(HostError);
	expect((error as HostError).code).toBe(code);
}

/**
 * Behavior every Host must have. Run against the in-memory fake here, and
 * the same rules are mirrored by the Rust tests for the real host (T04).
 */
export function describeHostContract(name: string, makeHost: () => Host) {
	describe(`Host contract: ${name}`, () => {
		let host: Host;
		beforeEach(() => {
			host = makeHost();
		});

		it("keeps the app's own files apart from the vault", async () => {
			expect(await host.readAppFile("session.json")).toBeNull();
			await host.writeAppFile("session.json", "one");
			await host.writeAppFile("session.json", "two");
			expect(await host.readAppFile("session.json")).toBe("two");
			expect(await host.list("")).toEqual([]);
		});

		it("only writes reports once a reports folder is chosen, under safe names", async () => {
			expect(await host.reportsFolder()).toBeNull();
			await expectCode(host.writeReport("r.txt", "x"), "invalid-path");
			expect(await host.chooseReportsFolder()).not.toBeNull();
			expect(await host.reportsFolder()).not.toBeNull();
			await host.writeReport("r.txt", "x");
			for (const bad of ["../r.txt", "a/b.txt", "r.md", ".r.txt", ""]) {
				await expectCode(host.writeReport(bad, "x"), "invalid-path");
			}
			expect(await host.list("")).toEqual([]);
		});

		it("reports no update script run until one is started, and runs one at a time", async () => {
			expect(await host.updateScriptStatus()).toEqual({
				state: "idle",
				lastLine: "",
			});
			await host.startUpdateScript();
			expect((await host.updateScriptStatus()).state).toBe("running");
			await expectCode(host.startUpdateScript(), "io");
		});

		it("reads the end of the log", async () => {
			expect(await host.readLogTail(5)).toBe("");
			await host.appendLog("a\nb\nc");
			expect(await host.readLogTail(2)).toBe("b\nc");
		});

		it("writes, reads and overwrites a file", async () => {
			await host.writeTextAtomic("a.vnote", "one");
			expect(await host.readText("a.vnote")).toBe("one");
			await host.writeTextAtomic("a.vnote", "two");
			expect(await host.readText("a.vnote")).toBe("two");
		});

		it("keeps unicode text exactly", async () => {
			const text = "Title 😀 café 日本\n";
			await host.writeTextAtomic("u.vnote", text);
			expect(await host.readText("u.vnote")).toBe(text);
		});

		it("needs the parent folder to exist", async () => {
			await expectCode(
				host.writeTextAtomic("missing/a.vnote", "x"),
				"not-found",
			);
		});

		it("makes folders with their parents, and again without error", async () => {
			await host.makeFolder("a/b/c");
			await host.makeFolder("a/b/c");
			expect(await host.kindOf("a/b")).toBe("folder");
			await host.writeTextAtomic("a/b/c/n.vnote", "x");
			expect(await host.kindOf("a/b/c/n.vnote")).toBe("file");
		});

		it("lists a folder sorted by name, root included", async () => {
			await host.makeFolder("Zeta");
			await host.writeTextAtomic("beta.vnote", "x");
			await host.writeTextAtomic("Alpha.vnote", "x");
			expect(await host.list("")).toEqual([
				{ name: "Alpha.vnote", kind: "file" },
				{ name: "Zeta", kind: "folder" },
				{ name: "beta.vnote", kind: "file" },
			]);
		});

		it("reports what is at a path", async () => {
			await host.makeFolder("f");
			await host.writeTextAtomic("f/n", "x");
			expect(await host.kindOf("f")).toBe("folder");
			expect(await host.kindOf("f/n")).toBe("file");
			expect(await host.kindOf("nothing")).toBeNull();
			expect(await host.kindOf("f/n/deeper")).toBeNull();
		});

		it("gives clear error codes", async () => {
			await host.makeFolder("f");
			await host.writeTextAtomic("file", "x");
			await expectCode(host.readText("nope"), "not-found");
			await expectCode(host.readText("f"), "is-a-folder");
			await expectCode(host.writeTextAtomic("f", "x"), "is-a-folder");
			await expectCode(host.list("file"), "not-a-folder");
			await expectCode(host.makeFolder("file/sub"), "not-a-folder");
		});

		it("refuses unsafe paths everywhere", async () => {
			for (const bad of ["/abs", "../up", "a/../b", "a//b", "a\\b", ""]) {
				await expectCode(host.readText(bad), "invalid-path");
				await expectCode(host.writeTextAtomic(bad, "x"), "invalid-path");
				await expectCode(host.move("x", bad), "invalid-path");
				await expectCode(host.makeFolder(bad), "invalid-path");
			}
		});

		it("never puts a path from outside into an error message", async () => {
			const error = await host.readText("../../etc/passwd").catch((e) => e);
			expect(String(error.message)).not.toContain("/etc");
		});

		it("moves and renames files and folders", async () => {
			await host.makeFolder("from/inner");
			await host.writeTextAtomic("from/inner/n.vnote", "x");
			await host.makeFolder("to");
			await host.move("from", "to/moved");
			expect(await host.readText("to/moved/inner/n.vnote")).toBe("x");
			expect(await host.kindOf("from")).toBeNull();
		});

		it("refuses to move onto an existing entry", async () => {
			await host.writeTextAtomic("a", "1");
			await host.writeTextAtomic("b", "2");
			await expectCode(host.move("a", "b"), "already-exists");
			expect(await host.readText("b")).toBe("2");
		});

		it("refuses to move a folder into itself", async () => {
			await host.makeFolder("f/g");
			await expectCode(host.move("f", "f/g/f"), "invalid-path");
		});

		describe("delete forever (removeTrashed)", () => {
			const STAMP = ".vaultops/trash/2026-11-01T10-00-00-000Z";
			async function trashed(rel: string) {
				const path = `${STAMP}/${rel}`;
				await host.makeFolder(path.slice(0, path.lastIndexOf("/")));
				await host.writeTextAtomic(path, "x");
				return path;
			}

			it("deletes the note and the folders it leaves empty, but not the trash", async () => {
				const path = await trashed("Notes/Deep/a.vnote");
				await host.removeTrashed(path);
				expect(await host.kindOf(path)).toBeNull();
				expect(await host.kindOf(STAMP)).toBeNull();
				expect(await host.kindOf(".vaultops/trash")).toBe("folder");
			});

			it("keeps a sibling note and its folders", async () => {
				const a = await trashed("Notes/a.vnote");
				const b = await trashed("Notes/b.vnote");
				await host.removeTrashed(a);
				expect(await host.kindOf(a)).toBeNull();
				expect(await host.kindOf(b)).toBe("file");
				expect(await host.kindOf(STAMP)).toBe("folder");
			});

			it("refuses anything that is not a note inside the trash", async () => {
				await host.writeTextAtomic("a.vnote", "x");
				await host.makeFolder(".vaultops/history/s");
				await host.makeFolder(".vaultops/trash");
				await host.writeTextAtomic(".vaultops/history/s/a.vnote", "x");
				await host.writeTextAtomic(".vaultops/trash/loose.vnote", "x");
				const inside = await trashed("a.vnote");
				for (const bad of [
					"a.vnote",
					".vaultops/history/s/a.vnote",
					".vaultops/trash",
					STAMP,
					".vaultops/trash/loose.vnote",
					".VaultOps/trash/s/a.vnote",
					".vaultops/Trash/s/a.vnote",
					"../a.vnote",
					"/a.vnote",
					"",
				]) {
					await expectCode(host.removeTrashed(bad), "invalid-path");
				}
				expect(await host.kindOf("a.vnote")).toBe("file");
				expect(await host.kindOf(".vaultops/history/s/a.vnote")).toBe("file");
				expect(await host.kindOf(".vaultops/trash/loose.vnote")).toBe("file");
				expect(await host.kindOf(inside)).toBe("file");
			});

			it("refuses a folder and reports a missing note", async () => {
				const note = await trashed("Notes/a.vnote");
				await expectCode(host.removeTrashed(`${STAMP}/Notes`), "is-a-folder");
				await expectCode(
					host.removeTrashed(`${STAMP}/Notes/ghost.vnote`),
					"not-found",
				);
				await expectCode(
					host.removeTrashed(`${STAMP}/Nowhere/a.vnote`),
					"not-found",
				);
				expect(await host.kindOf(note)).toBe("file");
			});
		});

		it("fails moving something that is not there", async () => {
			await expectCode(host.move("ghost", "x"), "not-found");
		});

		describe("Mac name rules", () => {
			it("treats capital letters as the same file", async () => {
				await host.writeTextAtomic("Note.vnote", "x");
				expect(await host.readText("note.VNOTE")).toBe("x");
				expect(await host.kindOf("NOTE.vnote")).toBe("file");
			});

			it("treats é typed two ways as the same file", async () => {
				await host.writeTextAtomic("café.vnote", "x");
				expect(await host.readText("café.vnote")).toBe("x");
			});

			it("keeps the first-written name when overwriting", async () => {
				await host.writeTextAtomic("Note.vnote", "1");
				await host.writeTextAtomic("note.vnote", "2");
				expect(await host.list("")).toEqual([
					{ name: "Note.vnote", kind: "file" },
				]);
			});

			it("renames when only capital letters change", async () => {
				await host.writeTextAtomic("note.vnote", "x");
				await host.move("note.vnote", "Note.vnote");
				expect(await host.list("")).toEqual([
					{ name: "Note.vnote", kind: "file" },
				]);
			});

			it("refuses a different file whose name differs only by case", async () => {
				await host.writeTextAtomic("a", "1");
				await host.writeTextAtomic("Note", "2");
				await expectCode(host.move("a", "NOTE"), "already-exists");
			});
		});
	});
}
