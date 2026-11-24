import { expect, it, vi } from "vitest";
import {
	type Block,
	type NoteHeader,
	serializeNote,
} from "../core/note-format";
import { addEntry, logPath, newLogNote } from "../core/planner/log";
import { CARDS } from "../core/resources/resources";
import { MemoryHost } from "../host/memory-host";
import { createReadTools } from "./tools";

function note(
	noteId: string,
	fields: Partial<NoteHeader> = {},
	blocks: Block[] = [],
) {
	return serializeNote({
		header: { format: "vaultops-note", v: 1, noteId, ...fields },
		blocks,
	});
}

it("lists, searches and reads notes using saved blocks, tags and link IDs", async () => {
	const host = new MemoryHost();
	const props = {
		tags: { type: "list", value: ["work/clients"] },
		Location: { type: "text", value: "München" },
	};
	const blocks: Block[] = [
		{
			id: "b1",
			type: "heading",
			parent: null,
			content: [
				{ type: "text", text: "Quarterly forecast" },
				{
					type: "noteLink",
					attrs: { kind: "note", target: "budget", label: "Old title" },
				},
			],
		},
	];
	await host.writeTextAtomic(
		"Plan.vnote",
		note("plan", { title: "Plan", props }, blocks),
	);
	await host.writeTextAtomic(
		"Budget.vnote",
		note("budget", { title: "Budget" }),
	);
	const api = createReadTools(host);
	expect((await api.list_notes()).map((item) => item.title)).toEqual([
		"Budget",
		"Plan",
	]);
	expect(await api.list_notes({ tag: "Work" })).toMatchObject([
		{ noteId: "plan" },
	]);
	expect(await api.list_tags()).toEqual(["work/clients"]);
	expect(await api.search_notes({ query: "forecast munchen" })).toMatchObject([
		{ path: "Plan.vnote", noteId: "plan" },
	]);
	const result = await api.read_note({ path: "Plan.vnote" });
	expect(result).toMatchObject({
		health: { group: "good" },
		note: { blocks, properties: props, tags: ["work/clients"] },
	});
	expect(JSON.parse(JSON.stringify(result))).toEqual(result);
	expect(await api.get_links({ path: "Plan.vnote" })).toEqual([
		{ kind: "note", target: "budget", label: "Old title" },
	]);
	expect(await api.get_backlinks({ noteId: "budget" })).toEqual([
		{ path: "Plan.vnote", title: "Plan", noteId: "plan", kind: "note" },
	]);
});

it("reads journal days, resource cards and health without exposing other vault internals", async () => {
	const host = new MemoryHost();
	const day = "2026-11-24";
	const path = logPath(day);
	await host.makeFolder("Journal");
	const journal = newLogNote(day);
	const log = {
		header: {
			...journal.header,
			format: "vaultops-note",
			v: 1,
			noteId: "log",
		} as NoteHeader,
		blocks: [],
	};
	await host.writeTextAtomic(
		path,
		serializeNote(addEntry(log, null, "Shipped", [])),
	);
	await host.writeTextAtomic("Broken.vnote", "not a note");
	await host.makeFolder(CARDS);
	await host.writeTextAtomic(
		`${CARDS}/Book.vnote`,
		note("book", { title: "Book", resource: { type: "book" } }),
	);
	await host.makeFolder(".vaultops/trash");
	await host.writeTextAtomic(".vaultops/trash/Hidden.vnote", note("hidden"));
	const write = vi.spyOn(host, "writeTextAtomic");
	const mkdir = vi.spyOn(host, "makeFolder");
	const api = createReadTools(host);
	expect(await api.list_journal_days()).toEqual([{ day, path }]);
	expect(await api.read_journal_day({ day })).toMatchObject({
		day,
		sections: [{ name: "Log", entries: [{ text: "Shipped" }] }],
	});
	expect(await api.read_journal_day({ day: "2026-02-30" })).toBeNull();
	expect(await api.list_resources()).toMatchObject({
		cards: [{ title: "Book", typeId: "book" }],
		types: expect.any(Array),
	});
	expect(
		await api.read_resource({ path: `${CARDS}/Book.vnote` }),
	).toMatchObject({ noteId: "book", blocks: [] });
	expect(await api.vault_health()).toMatchObject([
		{ path: "Broken.vnote", group: "corrupt" },
		{ path },
	]);
	expect(await api.read_note({ path: "Broken.vnote" })).toMatchObject({
		note: null,
	});
	for (const path of ["../Hidden.vnote", ".vaultops/trash/Hidden.vnote"]) {
		expect(await api.read_note({ path })).toBeNull();
		expect(await api.read_resource({ path })).toBeNull();
	}
	expect(write).not.toHaveBeenCalled();
	expect(mkdir).not.toHaveBeenCalled();
});
