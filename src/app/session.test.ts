import { describe, expect, it } from "vitest";
import { createNote } from "../core/notes/repository";
import type { Host } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { chooseAndLoad, loadVault, newNote } from "./session";

function noVaultHost(): Host {
	const host = new MemoryHost();
	host.currentVault = async () => null;
	host.chooseVault = async () => null;
	return host;
}

describe("vault session", () => {
	it("shows nothing when no vault is open, and a cancelled picker changes nothing", async () => {
		const host = noVaultHost();
		expect((await loadVault(host)).status).toBe("none");
		expect(await chooseAndLoad(host)).toBeNull();
	});

	it("creates a vault in an empty folder and starts with no notes", async () => {
		const view = await loadVault(new MemoryHost());
		expect(view).toMatchObject({
			status: "created",
			writable: true,
			notes: [],
		});
	});

	it("adds notes and lists them by title, including subfolders", async () => {
		const host = new MemoryHost();
		let view = await loadVault(host);
		view = await newNote(host, view);
		view = await newNote(host, view);
		await host.makeFolder("Class");
		await host.writeTextAtomic(
			"Class/Lecture.vnote",
			'{"format":"vaultops-note","v":1,"noteId":"n-1","title":"Lecture 1"}\n',
		);
		view = await loadVault(host);
		expect(view.status).toBe("opened");
		expect(view.notes.map((n) => [n.path, n.title])).toEqual([
			["Class/Lecture.vnote", "Lecture 1"],
			["Untitled 2.vnote", "Untitled"],
			["Untitled.vnote", "Untitled"],
		]);
	});

	it("keeps each note's text and the notes it links to, for searching and Linked from", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		const link = (id: string) =>
			`{"id":"b1","type":"paragraph","parent":null,"content":[{"type":"text","text":"See "},{"type":"noteLink","attrs":{"kind":"note","target":"${id}","label":"Other"}},{"type":"noteLink","attrs":{"kind":"note","target":"${id}","label":"Other"}}]}\n`;
		await host.writeTextAtomic(
			"Hub.vnote",
			`{"format":"vaultops-note","v":1,"noteId":"hub","title":"Hub"}\n${link("other")}`,
		);
		const view = await loadVault(host);
		const row = view.notes.find((n) => n.title === "Hub");
		expect(row?.text).toBe("See OtherOther");
		expect(row?.links).toEqual(["other"]);
	});

	it("shows a blank title as Untitled", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		await host.writeTextAtomic(
			"Blank.vnote",
			'{"format":"vaultops-note","v":1,"noteId":"n-2","title":"   "}\n',
		);
		const view = await loadVault(host);
		expect(view.notes.map((n) => n.title)).toEqual(["Untitled"]);
	});

	it("explains a folder that isn't a vault and allows no writes", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("shopping.txt", "milk");
		const view = await loadVault(host);
		expect(view.status).toBe("not-a-vault");
		expect(view.writable).toBe(false);
		expect(view.messages[0]).toMatch(/isn't a vault/);
		expect(await newNote(host, view)).toBe(view);
		expect((await host.list("")).map((e) => e.name)).toEqual(["shopping.txt"]);
	});

	it("reports damaged notes but still lists the good ones", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		await host.writeTextAtomic("broken.vnote", "not json\n");
		const view = await loadVault(host);
		expect(view.notes).toEqual([]);
		expect(view.report).toContainEqual(
			expect.objectContaining({ path: "broken.vnote", group: "corrupt" }),
		);
	});
});

describe("note list order", () => {
	it("sorts by title ignoring case, then path", async () => {
		const { compareRows } = await import("./session");
		const rows = [
			{ path: "z.vnote", title: "banana", readOnly: false, tags: [] },
			{ path: "a.vnote", title: "Cherry", readOnly: false, tags: [] },
			{ path: "m.vnote", title: "Apple", readOnly: false, tags: [] },
			{ path: "b.vnote", title: "apple", readOnly: false, tags: [] },
		].sort(compareRows);
		expect(rows.map((r) => r.path)).toEqual([
			"b.vnote",
			"m.vnote",
			"z.vnote",
			"a.vnote",
		]);
	});

	it("shows exactly the vault's folders and notes, and hides .vaultops", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		await host.makeFolder("Class/Week 1");
		await host.makeFolder("Empty");
		await host.makeFolder(".vaultops/trash/2026-11-01T10-00-00-000Z");
		await host.writeTextAtomic(
			"Class/Week 1/Lecture.vnote",
			'{"format":"vaultops-note","v":1,"noteId":"n-1","title":"Lecture 1"}\n',
		);
		await host.writeTextAtomic(
			".vaultops/trash/2026-11-01T10-00-00-000Z/Old.vnote",
			'{"format":"vaultops-note","v":1,"noteId":"n-2","title":"Old"}\n',
		);
		const view = await loadVault(host);
		expect(view.folders.sort()).toEqual(["Class", "Class/Week 1", "Empty"]);
		expect(view.notes.map((n) => n.path)).toEqual([
			"Class/Week 1/Lecture.vnote",
		]);
	});
});

describe("tags in the note list", () => {
	it("carries each note's tags from its header, empty when it has none", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		const a = await createNote(host, "", "Tagged");
		await createNote(host, "", "Plain");
		const text = await host.readText(a.path);
		const lines = text.split("\n");
		const header = JSON.parse(lines[0] ?? "{}");
		header.props = { tags: { type: "list", value: ["idea", "Work"] } };
		await host.writeTextAtomic(
			a.path,
			[JSON.stringify(header), ...lines.slice(1)].join("\n"),
		);
		const view = await loadVault(host);
		const byTitle = Object.fromEntries(
			view.notes.map((n) => [n.title, n.tags]),
		);
		expect(byTitle).toEqual({ Tagged: ["idea", "Work"], Plain: [] });
	});
});
