import { describe, expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import {
	discardChange,
	groupChanges,
	lastSavePoint,
	noteChange,
} from "./changes";

const note = (text: string) =>
	`${JSON.stringify({ format: "vaultops-note", v: 1, noteId: "n", title: "N" })}\n${JSON.stringify({ id: "a", type: "paragraph", parent: null, content: [{ type: "text", text }] })}\n`;

async function vault() {
	const host = new MemoryHost();
	await host.writeTextAtomic("N.vnote", note("Saved"));
	await host.writeTextAtomic("Gone.vnote", note("Bye"));
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("N.vnote", note("Edited"));
	await host.writeTextAtomic("New.vnote", note("Fresh"));
	await host.makeFolder("attachments");
	await host.writeTextAtomic("attachments/pic.png", "png");
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(".vaultops/pinned.json", "[]");
	await host.move("Gone.vnote", ".vaultops/x.vnote");
	return host;
}

describe("changes", () => {
	it("groups notes, attachments and app data", async () => {
		const host = await vault();
		const g = groupChanges((await host.vcs.status()).changes);
		expect(g.notes.map((c) => c.path)).toEqual([
			"Gone.vnote",
			"N.vnote",
			"New.vnote",
		]);
		expect(g.attachments.map((c) => c.path)).toEqual(["attachments/pic.png"]);
		expect(g.appData.map((c) => c.path).sort()).toEqual([
			".vaultops/pinned.json",
			".vaultops/x.vnote",
		]);
	});

	it("summarises each note's change", async () => {
		const host = await vault();
		const head = await lastSavePoint(host);
		const sum = async (
			path: string,
			kind: "modified" | "untracked" | "deleted",
		) => (await noteChange(host, { path, kind }, head)).summary;
		expect(await sum("N.vnote", "modified")).toBe("1 changed");
		expect(await sum("New.vnote", "untracked")).toBe("New note");
		expect(await sum("Gone.vnote", "deleted")).toBe("Deleted");
	});

	it("discards a change, keeping the current version in recovery", async () => {
		const host = await vault();
		const head = await lastSavePoint(host);
		const now = new Date("2026-11-25T10:00:00Z");
		const kept = await discardChange(
			host,
			{ path: "N.vnote", kind: "modified" },
			head,
			now,
		);
		expect(await host.readText("N.vnote")).toContain("Saved");
		expect(await host.readText(kept as string)).toContain("Edited");
		const moved = await discardChange(
			host,
			{ path: "New.vnote", kind: "untracked" },
			head,
			now,
		);
		expect(await host.kindOf("New.vnote")).toBeNull();
		expect(await host.readText(moved as string)).toContain("Fresh");
		expect(
			await discardChange(
				host,
				{ path: "Gone.vnote", kind: "deleted" },
				head,
				now,
			),
		).toBeNull();
		expect(await host.readText("Gone.vnote")).toContain("Bye");
	});
});
