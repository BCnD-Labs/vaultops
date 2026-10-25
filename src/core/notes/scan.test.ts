import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import {
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	serializeNote,
} from "../note-format";
import { scanVault } from "./scan";

function text(id: string, version = NOTE_FORMAT_VERSION): string {
	return serializeNote({
		header: { format: NOTE_FORMAT, v: version, noteId: id },
		blocks: [{ id: "block-1", type: "paragraph", parent: null }],
	});
}

describe("scanVault", () => {
	it("reports every health group and preserves every file exactly", async () => {
		const host = new MemoryHost();
		const files = {
			"good.vnote": text("good"),
			"corrupt.vnote": "not a note\n",
			"truncated.vnote": `${text("truncated")}{{\n`,
			"newer.vnote": text("newer", NOTE_FORMAT_VERSION + 1),
			"other.txt": "leave me alone\r\n",
		};
		for (const [path, contents] of Object.entries(files)) {
			await host.writeTextAtomic(path, contents);
		}
		const write = vi.spyOn(host, "writeTextAtomic");
		const move = vi.spyOn(host, "move");
		const mkdir = vi.spyOn(host, "makeFolder");
		const { notes, report } = await scanVault(host);
		expect(report.map(({ path, group }) => [path, group])).toEqual([
			["corrupt.vnote", "corrupt"],
			["good.vnote", "good"],
			["newer.vnote", "newer-format"],
			["truncated.vnote", "truncated"],
		]);
		expect(notes.map(({ path, readOnly }) => [path, readOnly])).toEqual([
			["good.vnote", false],
			["newer.vnote", true],
			["truncated.vnote", true],
		]);
		expect(
			notes.find(({ path }) => path === "truncated.vnote")?.note.blocks,
		).toEqual([{ id: "block-1", type: "paragraph", parent: null }]);
		expect(report.every((entry) => entry.reason.length > 0)).toBe(true);
		for (const [path, contents] of Object.entries(files)) {
			expect(await host.readText(path)).toBe(contents);
		}
		expect(write).not.toHaveBeenCalled();
		expect(move).not.toHaveBeenCalled();
		expect(mkdir).not.toHaveBeenCalled();
	});

	it("keeps all copies readable and reports every other path for duplicate IDs", async () => {
		const host = new MemoryHost();
		const paths = ["a.vnote", "b.vnote", "c.vnote"];
		for (const path of paths) await host.writeTextAtomic(path, text("same"));
		const { notes, report } = await scanVault(host);
		expect(notes).toHaveLength(3);
		for (const path of paths) {
			expect(notes.find((note) => note.path === path)).toMatchObject({
				note: { header: { noteId: "same" } },
				readOnly: true,
			});
			expect(report.find((entry) => entry.path === path)).toMatchObject({
				group: "good",
				duplicateOf: paths.filter((other) => other !== path),
			});
			expect(await host.readText(path)).toBe(text("same"));
		}
	});

	it("finds nested notes and never enters or reads the reserved root folder", async () => {
		const host = new MemoryHost();
		await host.makeFolder("notes/deep.vnote");
		await host.makeFolder(".VaultOps/history");
		await host.writeTextAtomic("notes/deep.vnote/found.vnote", text("nested"));
		await host.writeTextAtomic(".VaultOps/hidden.vnote", text("hidden"));
		await host.writeTextAtomic(
			".VaultOps/history/hidden.vnote",
			text("hidden"),
		);
		const list = vi.spyOn(host, "list");
		const read = vi.spyOn(host, "readText");
		const result = await scanVault(host);
		expect(result.notes.map((note) => note.path)).toEqual([
			"notes/deep.vnote/found.vnote",
		]);
		expect(read.mock.calls).toEqual([["notes/deep.vnote/found.vnote"]]);
		expect(list.mock.calls.some(([path]) => path.startsWith(".VaultOps"))).toBe(
			false,
		);
	});

	it("reports unreadable files and continues to other notes", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("a.vnote", text("unreadable"));
		await host.writeTextAtomic("b.vnote", text("readable"));
		vi.spyOn(host, "readText").mockRejectedValueOnce(
			new HostError("io", "read failed"),
		);
		const result = await scanVault(host);
		expect(result.report[0]).toMatchObject({
			path: "a.vnote",
			group: "corrupt",
			reason: "The file could not be read.",
		});
		expect(result.notes.map((note) => note.path)).toEqual(["b.vnote"]);
	});

	it("keeps blocks with ID problems readable but never calls them good", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic(
			"bad-ids.vnote",
			text("id").replace('"id":"block-1",', ""),
		);
		const result = await scanVault(host);
		expect(result.report[0]?.group).toBe("corrupt");
		expect(result.notes[0]).toMatchObject({ readOnly: true });
		expect(result.notes[0]?.note.blocks).toHaveLength(1);
	});

	it("gives newer format priority over skipped lines and still finds duplicates", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("a.vnote", `${text("same", 99)}{\n`);
		await host.writeTextAtomic("b.vnote", text("same"));
		const result = await scanVault(host);
		expect(result.report[0]).toMatchObject({
			group: "newer-format",
			duplicateOf: ["b.vnote"],
		});
		expect(result.report[1]?.duplicateOf).toEqual(["a.vnote"]);
		expect(result.notes[0]?.note.blocks).toHaveLength(1);
	});

	it("returns empty results for an empty vault and propagates folder failures", async () => {
		const host = new MemoryHost();
		expect(await scanVault(host)).toEqual({ notes: [], report: [] });
		const error = new HostError("io", "cannot list folder");
		vi.spyOn(host, "list").mockRejectedValue(error);
		await expect(scanVault(host)).rejects.toBe(error);
	});
});
