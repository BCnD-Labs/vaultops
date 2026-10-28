import { describe, expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import { createNote } from "./repository";
import { listTrash, restoreNote, trashNote } from "./trash";

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
});
