import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import { createFolder, moveFolder, renameFolder } from "./folders";
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
