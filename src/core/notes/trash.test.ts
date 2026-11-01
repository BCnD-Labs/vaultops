import { describe, expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import { createNote } from "./repository";
import {
	deleteForever,
	listTrash,
	restoreNote,
	trashFolder,
	trashNote,
} from "./trash";

async function vault() {
	const host = new MemoryHost();
	await openVault(host);
	return host;
}
const T1 = new Date("2026-10-27T15:04:05.123Z");

describe("trash", () => {
	it("moves a note into a timestamped trash folder and restores it unchanged", async () => {
		const host = await vault();
		const { path } = await createNote(host, "", "Groceries");
		const before = await host.readText(path);
		const { trashPath } = await trashNote(host, path, T1);
		expect(trashPath).toBe(
			".vaultops/trash/2026-10-27T15-04-05-123Z/Groceries.vnote",
		);
		expect(await host.kindOf(path)).toBeNull();
		const restored = await restoreNote(host, trashPath);
		expect(restored.path).toBe(path);
		expect(await host.readText(path)).toBe(before);
		expect(await listTrash(host)).toEqual([]);
	});

	it("keeps the folder layout and restores into it", async () => {
		const host = await vault();
		await host.makeFolder("Projects/Alpha");
		const { path } = await createNote(host, "Projects/Alpha", "Plan");
		const { trashPath } = await trashNote(host, path, T1);
		expect(trashPath.endsWith("/Projects/Alpha/Plan.vnote")).toBe(true);
		expect((await restoreNote(host, trashPath)).path).toBe(path);
	});

	it("restores to the vault root when the original folder is gone", async () => {
		const host = await vault();
		await host.makeFolder("Old");
		const { path } = await createNote(host, "Old", "Plan");
		const { trashPath } = await trashNote(host, path, T1);
		const old = await host.list("Old");
		expect(old).toEqual([]);
		await host.move("Old", ".vaultops/trash/gone");
		expect((await restoreNote(host, trashPath)).path).toBe("Plan.vnote");
	});

	it("gives a taken name the next free name, including a capital-letter-only clash", async () => {
		const host = await vault();
		const { path } = await createNote(host, "", "Plan");
		const first = await trashNote(host, path, T1);
		await createNote(host, "", "Plan");
		expect((await restoreNote(host, first.trashPath)).path).toBe(
			"Plan 2.vnote",
		);

		const host2 = await vault();
		const a = await createNote(host2, "", "Plan");
		const t = await trashNote(host2, a.path, T1);
		await host2.writeTextAtomic("PLAN.vnote", "other");
		expect((await restoreNote(host2, t.trashPath)).path).toBe("Plan 2.vnote");
		expect(await host2.readText("PLAN.vnote")).toBe("other");
	});

	it("does not collide when two notes are deleted in the same millisecond", async () => {
		const host = await vault();
		const a = await createNote(host, "", "A");
		const b = await createNote(host, "", "B");
		const ta = await trashNote(host, a.path, T1);
		const tb = await trashNote(host, b.path, T1);
		expect(ta.trashPath).not.toBe(tb.trashPath);
		expect(tb.trashPath).toContain("123Z 2/");
		expect((await listTrash(host)).map((t) => t.originalPath).sort()).toEqual([
			"A.vnote",
			"B.vnote",
		]);
	});

	it("refuses to trash anything inside .vaultops, or a note that isn't there", async () => {
		const host = await vault();
		const move = vi.spyOn(host, "move");
		await expect(
			trashNote(host, ".vaultops/config.json", T1),
		).rejects.toThrow();
		await expect(
			trashNote(host, ".VAULTOPS/config.json", T1),
		).rejects.toThrow();
		await expect(trashNote(host, "missing.vnote", T1)).rejects.toThrow();
		expect(move).not.toHaveBeenCalled();
	});

	it("lists original paths and times, newest first", async () => {
		const host = await vault();
		const a = await createNote(host, "", "Old");
		const b = await createNote(host, "", "New");
		await trashNote(host, a.path, new Date("2026-10-01T10:00:00.000Z"));
		await trashNote(host, b.path, new Date("2026-10-02T10:00:00.000Z"));
		const list = await listTrash(host);
		expect(list.map((t) => t.originalPath)).toEqual(["New.vnote", "Old.vnote"]);
		expect(list[0]?.deletedAt?.toISOString()).toBe("2026-10-02T10:00:00.000Z");
	});

	it("never restores something that is not in the trash", async () => {
		const host = await vault();
		const { path } = await createNote(host, "", "Plan");
		await expect(restoreNote(host, path)).rejects.toThrow();
		await expect(restoreNote(host, ".vaultops/config.json")).rejects.toThrow();
	});

	it("an empty vault has an empty trash", async () => {
		expect(await listTrash(await vault())).toEqual([]);
	});

	describe("delete forever", () => {
		it("erases a trashed note and leaves the trash tidy", async () => {
			const host = await vault();
			await host.makeFolder("Projects");
			const { path } = await createNote(host, "Projects", "Plan");
			const { trashPath } = await trashNote(host, path, T1);
			await deleteForever(host, trashPath);
			expect(await host.kindOf(trashPath)).toBeNull();
			expect(await listTrash(host)).toEqual([]);
			expect(await host.list(".vaultops/trash")).toEqual([]);
		});

		it("leaves other trashed notes alone", async () => {
			const host = await vault();
			const a = await createNote(host, "", "A");
			const b = await createNote(host, "", "B");
			const ta = await trashNote(host, a.path, T1);
			await trashNote(host, b.path, T1);
			await deleteForever(host, ta.trashPath);
			expect((await listTrash(host)).map((t) => t.originalPath)).toEqual([
				"B.vnote",
			]);
		});

		it("refuses anything outside the trash without asking the host to delete", async () => {
			const host = await vault();
			const { path } = await createNote(host, "", "Plan");
			const remove = vi.spyOn(host, "removeTrashed");
			for (const bad of [
				path,
				".vaultops/config.json",
				".vaultops/trash",
				".VaultOps/trash/x/Plan.vnote",
				"missing.vnote",
				"../Plan.vnote",
			]) {
				await expect(deleteForever(host, bad)).rejects.toThrow();
			}
			expect(remove).not.toHaveBeenCalled();
			expect(await host.kindOf(path)).toBe("file");
		});
	});

	describe("trashFolder", () => {
		it("moves the whole folder to the trash and its notes can be restored", async () => {
			const host = await vault();
			await host.makeFolder("Class/Week 1");
			const a = await createNote(host, "Class", "Syllabus");
			const b = await createNote(host, "Class/Week 1", "Lecture");
			const { trashPath } = await trashFolder(host, "Class", T1);
			expect(trashPath).toBe(".vaultops/trash/2026-10-27T15-04-05-123Z/Class");
			expect(await host.kindOf("Class")).toBeNull();
			const listed = await listTrash(host);
			expect(listed.map((t) => t.originalPath).sort()).toEqual([
				"Class/Syllabus.vnote",
				"Class/Week 1/Lecture.vnote",
			]);
			// The folder is gone, so a note comes back to the vault root, unchanged.
			const first = listed.find((t) => t.originalPath === a.path);
			expect(first).toBeDefined();
			const restored = await restoreNote(
				host,
				(first as { trashPath: string }).trashPath,
			);
			expect(restored.path).toBe("Syllabus.vnote");
			expect(await host.kindOf(b.path)).toBeNull();
		});

		it("restores into the folder again when it has been recreated", async () => {
			const host = await vault();
			await host.makeFolder("Class");
			const { path } = await createNote(host, "Class", "Syllabus");
			await trashFolder(host, "Class", T1);
			await host.makeFolder("Class");
			const [item] = await listTrash(host);
			expect(
				(await restoreNote(host, (item as { trashPath: string }).trashPath))
					.path,
			).toBe(path);
		});

		it("keeps an empty folder out of the way without erasing anything", async () => {
			const host = await vault();
			await host.makeFolder("Empty");
			await trashFolder(host, "Empty", T1);
			expect(await host.kindOf("Empty")).toBeNull();
			expect(
				await host.kindOf(".vaultops/trash/2026-10-27T15-04-05-123Z/Empty"),
			).toBe("folder");
		});

		it("does not collide when two deletions share a millisecond", async () => {
			const host = await vault();
			await host.makeFolder("A");
			await host.makeFolder("B");
			const a = await trashFolder(host, "A", T1);
			const b = await trashFolder(host, "B", T1);
			expect(a.trashPath).not.toBe(b.trashPath);
		});

		it("refuses the root, .vaultops, a note and a missing folder, moving nothing", async () => {
			const host = await vault();
			const { path } = await createNote(host, "", "Plan");
			const move = vi.spyOn(host, "move");
			for (const bad of [
				"",
				".vaultops",
				".VAULTOPS/trash",
				path,
				"Nowhere",
				"../x",
			]) {
				await expect(trashFolder(host, bad, T1), bad).rejects.toThrow();
			}
			expect(move).not.toHaveBeenCalled();
			expect(await host.kindOf(path)).toBe("file");
		});
	});
});
