import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Note, parseNote, serializeNote } from "../note-format";
import { processedDay } from "./inbox";
import { undoMove } from "./move-block";
import {
	rememberDestination,
	sendToJournal,
	sendToNewNote,
	sendToNote,
	suggestDestinations,
	turnIntoFlashcard,
} from "./send-to";

const day = "2026-11-18";
const note = (id: string, blocks: Note["blocks"] = []): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: id, title: id },
	blocks,
});
const block = {
	id: "b",
	type: "paragraph",
	parent: null,
	content: [{ type: "text", text: "An idea" }],
};
const inbox = () =>
	note("source", [
		{
			id: "h",
			type: "heading",
			parent: null,
			content: [{ type: "text", text: "Inbox" }],
		},
		block,
	]);
const setup = async () => {
	const host = new MemoryHost();
	await host.writeTextAtomic("source.vnote", serializeNote(inbox()));
	await host.writeTextAtomic(
		"target.vnote",
		serializeNote(
			note("target", [{ id: "heading", type: "heading", parent: null }]),
		),
	);
	return host;
};

it("ranks links, shared tags and recent paths, deduplicates, and keeps defaults", () => {
	const row = (id: string, tags: string[] = []) => ({
		path: `${id}.vnote`,
		note: {
			...note(id),
			header: {
				...note(id).header,
				props: { tags: { type: "list", value: tags } },
			},
		},
	});
	const source = row("source", ["Work"]);
	const linked = row("linked"),
		tagged = row("tagged", ["work"]),
		recent = row("recent");
	const withLink = {
		...block,
		content: [
			{
				type: "noteLink",
				attrs: { kind: "canvas", target: "linked", label: "Linked" },
			},
		],
	};
	expect(
		suggestDestinations(
			withLink,
			source,
			[recent, tagged, linked, source],
			["tagged.vnote", "recent.vnote"],
			day,
		).map((s) => (s.kind === "note" ? s.path : s.kind)),
	).toEqual(["linked.vnote", "tagged.vnote", "recent.vnote", "journal", "new"]);
	expect(
		rememberDestination(
			["A.vnote", "b.vnote", "a.vnote", "c.vnote", "d.vnote", "e.vnote"],
			"B.vnote",
		),
	).toEqual(["B.vnote", "A.vnote", "c.vnote", "d.vnote", "e.vnote"]);
});

it("moves under a heading, reconciles an empty inbox, and undoes both", async () => {
	const host = await setup();
	const before = await host.readText("source.vnote");
	const receipt = await sendToNote(
		host,
		"source.vnote",
		"target.vnote",
		"b",
		day,
		"heading",
	);
	expect(
		processedDay(parseNote(await host.readText("source.vnote")).note!),
	).toBe(day);
	expect(
		parseNote(await host.readText("target.vnote")).note?.blocks.map(
			(b) => b.id,
		),
	).toEqual(["heading", "b"]);
	await undoMove(host, receipt);
	expect(await host.readText("source.vnote")).toBe(before);
});

it("sends to a canvas, a new note, and a newly created journal", async () => {
	for (const kind of ["canvas", "new", "journal"] as const) {
		const host = await setup();
		let path: string;
		if (kind === "canvas") {
			path = "canvas.vnote";
			await host.writeTextAtomic(
				path,
				serializeNote({
					...note("canvas"),
					header: { ...note("canvas").header, kind: "canvas" },
				}),
			);
			await sendToNote(host, "source.vnote", path, "b", day);
		} else if (kind === "new")
			path = (await sendToNewNote(host, "source.vnote", "b", day)).destination;
		else
			path = (await sendToJournal(host, "source.vnote", "b", day)).destination;
		expect(
			parseNote(await host.readText(path)).note?.blocks.some(
				(b) => b.id === "b",
			),
		).toBe(true);
		if (kind === "journal") expect(path).toBe(`Journal/${day}.vnote`);
		if (kind === "new") expect(path).toBe("An idea.vnote");
	}
});

it("rolls back both notes when the source or reconciliation write fails", async () => {
	for (const failure of [2, 3]) {
		const host = await setup();
		const source = await host.readText("source.vnote"),
			target = await host.readText("target.vnote");
		const write = vi.spyOn(host, "writeTextAtomic");
		let calls = 0;
		write.mockImplementation(async (path, text) => {
			if (++calls === failure) throw new Error("disk full");
			return MemoryHost.prototype.writeTextAtomic.call(host, path, text);
		});
		await expect(
			sendToNote(host, "source.vnote", "target.vnote", "b", day),
		).rejects.toThrow();
		expect(await host.readText("source.vnote")).toBe(source);
		expect(await host.readText("target.vnote")).toBe(target);
	}
});

it("sets the flashcard role without changing the original", () => {
	expect(turnIntoFlashcard(block).attrs).toEqual({ role: "flashcard" });
	expect(block).not.toHaveProperty("attrs");
});
