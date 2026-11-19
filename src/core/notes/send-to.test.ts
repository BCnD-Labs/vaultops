import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { type Note, parseNote, serializeNote } from "../note-format";
import { taskFromNote } from "../planner/task-note";
import { isInboxEmpty, processedDay } from "./inbox";
import { undoMove } from "./move-block";
import {
	rememberDestination,
	sendToJournal,
	sendToNewNote,
	sendToNewTask,
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
		id,
		title: id,
		tags,
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

it("creates a planner task with the block as its description", async () => {
	const host = await setup();
	const r = await sendToNewTask(host, "source.vnote", "b", day, { due: day });
	expect(r.destination).toBe("Planner/An idea.vnote");
	const task = parseNote(await host.readText(r.destination)).note!;
	expect(taskFromNote(r.destination, task)).toMatchObject({
		title: "An idea",
		due: day,
		number: 1,
	});
	expect(task.blocks).toEqual([block]);
	expect(processedDay(parseNote(r.sourceAfter).note!)).toBe(day);
});

it("leaves a link outside the trailing inbox and undoes both writes exactly", async () => {
	const host = await setup();
	const before = await host.readText("source.vnote");
	const r = await sendToNewNote(host, "source.vnote", "b", day, { link: true });
	const source = parseNote(await host.readText(r.source)).note!;
	expect(isInboxEmpty(source)).toBe(true);
	expect(source.blocks.at(-1)?.content).toEqual([
		{
			type: "noteLink",
			attrs: {
				kind: "note",
				target: parseNote(r.destinationAfter).note?.header.noteId,
				label: "An idea",
			},
		},
	]);
	await undoMove(host, r);
	expect(await host.readText(r.source)).toBe(before);
	expect(await host.readText(r.destination)).toBe(r.destinationBefore);
});

it("refuses a destination the app would open read-only and changes nothing", async () => {
	const host = await setup();
	const target = `${await host.readText("target.vnote")}not a block line\n`;
	await host.writeTextAtomic("target.vnote", target);
	const source = await host.readText("source.vnote");
	await expect(
		sendToNote(host, "source.vnote", "target.vnote", "b", day),
	).rejects.toThrow("read-only");
	expect(await host.readText("source.vnote")).toBe(source);
	expect(await host.readText("target.vnote")).toBe(target);
});
