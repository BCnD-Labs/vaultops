import { describe, expect, it } from "vitest";
import { loadVault } from "../app/session";
import { listTrash } from "../core/notes/trash";
import { openNote } from "../editor/note-io";
import { seedVault } from "./seed";

describe("preview seed", () => {
	it("loads a writable sample with only the intended truncated note", async () => {
		const host = await seedVault();
		const view = await loadVault(host);
		expect(view.status).toBe("opened");
		expect(view.writable).toBe(true);
		expect(view.messages).toEqual([]);
		expect(view.notes).toHaveLength(10);
		expect(view.folders).toEqual(["Class", "Class/Week 1", "Projects"]);
		expect(view.report.filter((entry) => entry.group !== "good")).toEqual([
			expect.objectContaining({ group: "truncated" }),
		]);
		expect(view.report.every((entry) => entry.duplicateOf.length === 0)).toBe(
			true,
		);
		const emptyTitles: string[] = [];
		for (const row of view.notes) {
			const opened = await openNote(host, row.path);
			const truncated = row.title === "Recovered fragment";
			expect(opened.editable).toBe(!truncated);
			expect(opened.canAllowEditing).toBe(truncated);
			if (opened.note?.blocks.length === 0) emptyTitles.push(row.title);
		}
		expect(emptyTitles).toEqual(["Empty note"]);
		expect(view.notes.some((row) => row.tags.includes("ideas"))).toBe(true);
		const trash = await listTrash(host);
		expect(trash).toHaveLength(2);
		for (const entry of trash) {
			expect(entry.deletedAt?.toISOString()).toBe("2026-10-30T14:00:00.000Z");
			expect(view.notes.some((row) => row.path === entry.originalPath)).toBe(
				false,
			);
			expect((await openNote(host, entry.trashPath)).editable).toBe(true);
		}
	});
});
