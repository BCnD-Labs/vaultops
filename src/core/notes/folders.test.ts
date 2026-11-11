import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import {
	createFolder,
	folderNameProblem,
	movedPath,
	moveFolder,
	renameFolder,
	within,
} from "./folders";
import { createNote } from "./repository";

async function vault() {
	const host = new MemoryHost();
	await openVault(host);
	return host;
}

const names = async (host: MemoryHost, folder = "") =>
	(await host.list(folder)).map((e) => e.name);

describe("createFolder", () => {
	it("makes a folder, inside another one too", async () => {
		const host = await vault();
		expect(await createFolder(host, "", "Class")).toEqual({
			path: "Class",
			changed: true,
		});
		expect((await createFolder(host, "Class", "Week 1")).path).toBe(
			"Class/Week 1",
		);
		expect(await host.kindOf("Class/Week 1")).toBe("folder");
	});

	it("cleans the name like a note name: a/b, a leading dot and .git", async () => {
		const host = await vault();
		expect((await createFolder(host, "", "a/b")).path).toBe("a-b");
		expect((await createFolder(host, "", ".git")).path).toBe("git");
		expect((await createFolder(host, "", "  ")).path).toBe("New folder");
		expect(await names(host)).toEqual([
			".vaultops",
			"New folder",
			"a-b",
			"git",
		]);
	});

	it("gives a taken name the next free one, ignoring capital letters", async () => {
		const host = await vault();
		await createFolder(host, "", "Docs");
		expect((await createFolder(host, "", "docs")).path).toBe("docs 2");
		expect((await createFolder(host, "", "DOCS")).path).toBe("DOCS 3");
	});

	it("refuses .vaultops and a missing parent, and writes nothing", async () => {
		const host = await vault();
		const make = vi.spyOn(host, "makeFolder");
		for (const parent of [".vaultops", ".vaultops/trash", "Nowhere"]) {
			const result = await createFolder(host, parent, "X");
			expect(result.changed).toBe(false);
			expect(result.notice).toBeTruthy();
		}
		expect(make).not.toHaveBeenCalled();
	});

	it("says so when the folder could not be made", async () => {
		const host = await vault();
		vi.spyOn(host, "makeFolder").mockRejectedValue(
			new HostError("io", "disk full"),
		);
		const result = await createFolder(host, "", "X");
		expect(result.changed).toBe(false);
		expect(result.notice).toContain("disk full");
	});
});

describe("renameFolder", () => {
	it("renames the folder and its notes go with it", async () => {
		const host = await vault();
		await host.makeFolder("Old");
		const { path } = await createNote(host, "Old", "Plan");
		const before = await host.readText(path);
		const result = await renameFolder(host, "Old", "New");
		expect(result).toEqual({ path: "New", changed: true });
		expect(await host.kindOf("Old")).toBeNull();
		expect(await host.readText("New/Plan.vnote")).toBe(before);
	});

	it("allows a change of capital letters only", async () => {
		const host = await vault();
		await host.makeFolder("docs");
		const result = await renameFolder(host, "docs", "Docs");
		expect(result).toEqual({ path: "Docs", changed: true });
		expect(await names(host)).toContain("Docs");
	});

	it("cleans the new name and avoids a neighbour's name", async () => {
		const host = await vault();
		await host.makeFolder("A");
		await host.makeFolder("B");
		expect((await renameFolder(host, "B", "a")).path).toBe("a 2");
		await host.makeFolder("Inner/C");
		expect((await renameFolder(host, "Inner/C", ".x/y")).path).toBe(
			"Inner/x-y",
		);
	});

	it("does nothing when the name would not change", async () => {
		const host = await vault();
		await host.makeFolder("Same");
		const move = vi.spyOn(host, "move");
		expect(await renameFolder(host, "Same", "Same")).toEqual({
			path: "Same",
			changed: false,
		});
		expect(move).not.toHaveBeenCalled();
	});

	it("refuses the root, .vaultops, a missing folder and a note", async () => {
		const host = await vault();
		await createNote(host, "", "Plan");
		const move = vi.spyOn(host, "move");
		for (const path of [
			"",
			".vaultops",
			".vaultops/trash",
			"Nowhere",
			"Plan.vnote",
		]) {
			const result = await renameFolder(host, path, "X");
			expect(result.changed, path).toBe(false);
			expect(result.notice, path).toBeTruthy();
		}
		expect(move).not.toHaveBeenCalled();
	});

	it("keeps the folder where it is and says so when the rename fails", async () => {
		const host = await vault();
		await host.makeFolder("Keep");
		vi.spyOn(host, "move").mockRejectedValue(new HostError("io", "busy"));
		const result = await renameFolder(host, "Keep", "Other");
		expect(result).toMatchObject({ path: "Keep", changed: false });
		expect(result.notice).toContain("busy");
		expect(await host.kindOf("Keep")).toBe("folder");
	});
});

describe("moveFolder", () => {
	it("moves a folder with everything in it, and back to the root", async () => {
		const host = await vault();
		await host.makeFolder("Class/Week 1");
		await host.makeFolder("Archive");
		const { path } = await createNote(host, "Class/Week 1", "Lecture");
		const before = await host.readText(path);
		const moved = await moveFolder(host, "Class", "Archive");
		expect(moved).toEqual({ path: "Archive/Class", changed: true });
		expect(await host.readText("Archive/Class/Week 1/Lecture.vnote")).toBe(
			before,
		);
		expect(await host.kindOf("Class")).toBeNull();
		expect((await moveFolder(host, "Archive/Class", "")).path).toBe("Class");
	});

	it("refuses to go into itself or anything inside itself, in any capitalization", async () => {
		const host = await vault();
		await host.makeFolder("A/B");
		const move = vi.spyOn(host, "move");
		for (const into of ["A", "a", "A/B", "a/b"]) {
			const result = await moveFolder(host, "A", into);
			expect(result.changed, into).toBe(false);
			expect(result.notice, into).toContain("itself");
		}
		expect(move).not.toHaveBeenCalled();
	});

	it("does nothing when it is already there", async () => {
		const host = await vault();
		await host.makeFolder("A/B");
		const move = vi.spyOn(host, "move");
		expect(await moveFolder(host, "A/B", "A")).toEqual({
			path: "A/B",
			changed: false,
		});
		expect(move).not.toHaveBeenCalled();
	});

	it("takes the next free name when the destination has the same one", async () => {
		const host = await vault();
		await host.makeFolder("A/Notes");
		await host.makeFolder("Notes");
		expect((await moveFolder(host, "Notes", "A")).path).toBe("A/Notes 2");
		await host.makeFolder("B/notes");
		expect((await moveFolder(host, "A/Notes", "B")).path).toBe("B/Notes 2");
	});

	it("refuses .vaultops, a missing destination, the root and .vaultops itself as the source", async () => {
		const host = await vault();
		await host.makeFolder("A");
		const move = vi.spyOn(host, "move");
		expect((await moveFolder(host, "A", ".vaultops")).changed).toBe(false);
		expect((await moveFolder(host, "A", ".vaultops/trash")).changed).toBe(
			false,
		);
		expect((await moveFolder(host, "A", "Nowhere")).changed).toBe(false);
		expect((await moveFolder(host, "", "A")).changed).toBe(false);
		expect((await moveFolder(host, ".vaultops", "A")).changed).toBe(false);
		expect(move).not.toHaveBeenCalled();
		expect(await host.kindOf("A")).toBe("folder");
	});

	it("keeps the folder where it was and says so when the move fails", async () => {
		const host = await vault();
		await host.makeFolder("A");
		await host.makeFolder("B");
		vi.spyOn(host, "move").mockRejectedValue(new HostError("io", "busy"));
		const result = await moveFolder(host, "A", "B");
		expect(result).toMatchObject({ path: "A", changed: false });
		expect(result.notice).toContain("busy");
	});
});

describe("within and movedPath", () => {
	it("knows what is inside a folder, ignoring capital letters and Unicode form", () => {
		expect(within("A", "A")).toBe(true);
		expect(within("a/b/n.vnote", "A")).toBe(true);
		expect(within("A 2/n.vnote", "A")).toBe(false);
		expect(within("Ab", "A")).toBe(false);
		expect(within("Caf\u00e9/n", "Cafe\u0301")).toBe(true);
		expect(within("", "A")).toBe(false);
	});

	it("moves a path along with its folder, and leaves other paths alone", () => {
		expect(movedPath("Class", "Class", "Archive/Class")).toBe("Archive/Class");
		expect(movedPath("Class/Week 1/n.vnote", "Class", "Archive/Class")).toBe(
			"Archive/Class/Week 1/n.vnote",
		);
		expect(movedPath("Class 2/n.vnote", "Class", "X")).toBe("Class 2/n.vnote");
		expect(movedPath("n.vnote", "n.vnote", "Docs/n.vnote")).toBe(
			"Docs/n.vnote",
		);
	});
});

describe("folder depth limit", () => {
	/** Make `A/B/C/...` straight on the host, the way an older or outside tool could. */
	async function chain(host: MemoryHost, ...parts: string[]) {
		await host.makeFolder(parts.join("/"));
		return parts.join("/");
	}

	it("allows a folder at the fifth level and refuses a sixth, writing nothing", async () => {
		const host = await vault();
		const four = await chain(host, "A", "B", "C", "D");
		const fifth = await createFolder(host, four, "E");
		expect(fifth).toEqual({ path: "A/B/C/D/E", changed: true });
		const make = vi.spyOn(host, "makeFolder");
		const sixth = await createFolder(host, "A/B/C/D/E", "F");
		expect(sixth.changed).toBe(false);
		expect(sixth.path).toBe("A/B/C/D/E");
		expect(sixth.notice).toMatch(/at most 5 levels deep/);
		expect(make).not.toHaveBeenCalled();
		expect(await host.kindOf("A/B/C/D/E/F")).toBeNull();
	});

	it("counts from the vault root, so a top-level folder is level one", async () => {
		const host = await vault();
		expect((await createFolder(host, "", "A")).changed).toBe(true);
		expect((await createFolder(host, "A", "B")).path).toBe("A/B");
	});

	it("refuses to make a folder inside a legacy folder that is already too deep", async () => {
		const host = await vault();
		await chain(host, "A", "B", "C", "D", "E", "F", "G");
		const result = await createFolder(host, "A/B/C/D/E/F/G", "H");
		expect(result.changed).toBe(false);
		expect(result.notice).toMatch(/at most 5 levels deep/);
	});

	it("allows a note at any level, including inside a fifth-level folder", async () => {
		const host = await vault();
		await chain(host, "A", "B", "C", "D", "E");
		const { path } = await createNote(host, "A/B/C/D/E", "Deep note");
		expect(path).toBe("A/B/C/D/E/Deep note.vnote");
		expect(await host.kindOf(path)).toBe("file");
	});

	it("moves a folder to a place where its deepest part stays within five", async () => {
		const host = await vault();
		await chain(host, "Top", "One", "Two");
		await chain(host, "Src", "Inner");
		const result = await moveFolder(host, "Src", "Top/One/Two");
		expect(result).toEqual({ path: "Top/One/Two/Src", changed: true });
		expect(await host.kindOf("Top/One/Two/Src/Inner")).toBe("folder");
	});

	it("refuses a move that would push the deepest subfolder past five, moving nothing", async () => {
		const host = await vault();
		await chain(host, "Top", "One", "Two", "Three");
		await chain(host, "Src", "Inner");
		const move = vi.spyOn(host, "move");
		const result = await moveFolder(host, "Src", "Top/One/Two/Three");
		expect(result.changed).toBe(false);
		expect(result.path).toBe("Src");
		expect(result.notice).toMatch(/at most 5 levels deep/);
		expect(move).not.toHaveBeenCalled();
		expect(await host.kindOf("Src/Inner")).toBe("folder");
	});

	it("looks at the whole subtree, not only the folder being moved", async () => {
		const host = await vault();
		await chain(host, "Src", "a", "b", "c");
		await chain(host, "Top", "One");
		// Src alone is level 1 inside Top/One (depth 3), but Src/a/b/c reaches level 6.
		const result = await moveFolder(host, "Src", "Top/One");
		expect(result.changed).toBe(false);
		expect(await host.kindOf("Src/a/b/c")).toBe("folder");
		const allowed = await moveFolder(host, "Src", "Top");
		expect(allowed.changed).toBe(true);
		expect(await host.kindOf("Top/Src/a/b/c")).toBe("folder");
	});

	it("a plain note can still be moved into a fifth-level folder", async () => {
		const host = await vault();
		await chain(host, "A", "B", "C", "D", "E");
		const { path } = await createNote(host, "", "Loose");
		const { moveNote } = await import("./rename");
		const result = await moveNote(host, path, "A/B/C/D/E");
		expect(result.moved).toBe(true);
	});

	describe("folders that are already deeper than the limit", () => {
		async function legacy() {
			const host = await vault();
			await chain(host, "A", "B", "C", "D", "E", "F", "G");
			await chain(host, "Other");
			const { path } = await createNote(host, "A/B/C/D/E/F/G", "Old note");
			return { host, note: path };
		}

		it("still lists and opens, with their notes", async () => {
			const { host, note } = await legacy();
			expect(await names(host, "A/B/C/D/E/F")).toEqual(["G"]);
			expect(await host.readText(note)).toContain("Old note");
			const { scanVault } = await import("./scan");
			const scanned = await scanVault(host);
			expect(scanned.notes.map((n) => n.path)).toContain(note);
		});

		it("can be renamed, because a rename never changes the depth", async () => {
			const { host, note } = await legacy();
			const result = await renameFolder(host, "A/B/C/D/E/F", "Renamed");
			expect(result).toEqual({ path: "A/B/C/D/E/Renamed", changed: true });
			expect(await host.kindOf("A/B/C/D/E/Renamed/G")).toBe("folder");
			expect(await host.kindOf(note.replace("/F/", "/Renamed/"))).toBe("file");
		});

		it("a rename cannot nest: a slash in the name becomes a dash", async () => {
			const host = await vault();
			await chain(host, "A", "B", "C", "D", "E");
			const result = await renameFolder(host, "A/B/C/D/E", "x/y/z");
			expect(result.path).toBe("A/B/C/D/x-y-z");
			expect(result.changed).toBe(true);
		});

		it("can be moved to a shallower place", async () => {
			const { host } = await legacy();
			const result = await moveFolder(host, "A/B/C", "");
			expect(result).toEqual({ path: "C", changed: true });
			expect(await host.kindOf("C/D/E/F/G")).toBe("folder");
		});

		it("can be moved sideways without getting deeper, even though it is still over the limit", async () => {
			const { host } = await legacy();
			await chain(host, "X");
			// A/B is level 2 and reaches level 7; X/B is level 2 too, so it is no deeper than before.
			const result = await moveFolder(host, "A/B", "X");
			expect(result.changed).toBe(true);
			expect(await host.kindOf("X/B/C/D/E/F/G")).toBe("folder");
		});

		it("cannot be moved somewhere that makes it deeper", async () => {
			const { host } = await legacy();
			await chain(host, "P", "Q");
			const result = await moveFolder(host, "A/B", "P/Q");
			expect(result.changed).toBe(false);
			expect(result.notice).toMatch(/at most 5 levels deep/);
			expect(await host.kindOf("A/B/C/D/E/F/G")).toBe("folder");
		});
	});
});

describe("folder collision rules", () => {
	it("folderNameProblem refuses a sibling's name, ignoring capitals, Unicode form and cleaning", () => {
		expect(folderNameProblem("school", ["School"])).toMatch(/already here/);
		expect(folderNameProblem("SCHOOL", ["school"])).not.toBeNull();
		expect(folderNameProblem("Caf\u00e9", ["Cafe\u0301"])).not.toBeNull();
		expect(folderNameProblem("a/b", ["a-b"])).not.toBeNull();
		expect(folderNameProblem("a?b", ["a-b"])).not.toBeNull();
		expect(folderNameProblem("school 2", ["school"])).toBeNull();
		expect(folderNameProblem("", ["New folder"])).toBeNull();
		expect(folderNameProblem("x", [])).toBeNull();
	});

	it("create, rename and move all use the same ' 2' rule when a name is taken", async () => {
		const host = await vault();
		await host.makeFolder("school");
		await host.makeFolder("other");
		await host.makeFolder("A/School");
		expect((await createFolder(host, "", "School")).path).toBe("School 2");
		expect((await renameFolder(host, "other", "SCHOOL")).path).toBe("SCHOOL 3");
		expect((await moveFolder(host, "A/School", "")).path).toBe("School 4");
	});

	it("illegal characters in a folder name are cleaned before the clash check", async () => {
		const host = await vault();
		await createFolder(host, "", "a-b");
		expect((await createFolder(host, "", "a?b")).path).toBe("a-b 2");
		expect((await createFolder(host, "", 'x*y"z')).path).toBe("x-y-z");
	});

	it("renaming a suffixed folder to a clashing name never loses either folder", async () => {
		const host = await vault();
		await host.makeFolder("school");
		await host.makeFolder("school 2");
		// "School" clashes with "school", so it becomes "School 2": a capitals-only change of itself.
		expect((await renameFolder(host, "school 2", "School")).path).toBe(
			"School 2",
		);
		expect(await names(host)).toEqual(
			expect.arrayContaining(["school", "School 2"]),
		);
	});
});
