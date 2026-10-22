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
