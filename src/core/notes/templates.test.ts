import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import type { Note } from "../note-format";
import { openVault } from "../vault/vault";
import { scanVault } from "./scan";
import {
	blocksFromTemplate,
	createTemplateFolder,
	duplicateTemplate,
	listTemplates,
	removeTemplateEntry,
	renameTemplateEntry,
	saveTemplate,
	TEMPLATES,
	updateTemplate,
} from "./templates";

async function vault() {
	const host = new MemoryHost();
	await openVault(host);
	return host;
}

const text = (t: string) => [{ type: "text", text: t }];
function source(): Note {
	return {
		header: { format: "vaultops-note", v: 1, noteId: "src", title: "Meeting" },
		blocks: [
			{ id: "a", type: "heading", parent: null, content: text("{{title}}") },
			{ id: "t", type: "toggle", parent: null },
			{
				id: "ts",
				type: "paragraph",
				parent: "t",
				content: text("On {{date}} at {{time}}"),
			},
			{ id: "tb", type: "paragraph", parent: "t", content: text("Agenda") },
		],
	};
}
const NOW = new Date(2026, 10, 8, 16, 5);
const text0 = (t: string) => [{ text: t, type: "text" }];
const WHEN = new Date("2026-11-08T22:00:00.000Z");
const RECOVERY = ".vaultops/recovery/2026-11-08T22-00-00-000Z/templates";

async function names(host: MemoryHost) {
	const list = await listTemplates(host);
	return {
		templates: list.templates.map((t) => t.label),
		folders: list.folders.map((f) => f.label),
	};
}

describe("templates", () => {
	it("starts empty and creates its folder only when the first template is saved", async () => {
		const host = await vault();
		expect(await listTemplates(host)).toEqual({ folders: [], templates: [] });
		expect(await host.kindOf(TEMPLATES)).toBeNull();
		const saved = await saveTemplate(host, "Meeting", source());
		expect(saved).toEqual({
			ok: true,
			path: `${TEMPLATES}/Meeting.vnote`,
			replaced: false,
		});
		const [entry] = (await listTemplates(host)).templates;
		expect(entry?.name).toBe("Meeting");
		expect(entry?.preview).toBe("{{title}} On {{date}} at {{time}} Agenda");
		expect(entry?.note?.header.noteId).not.toBe("src");
		expect(entry?.note?.header.title).toBe("Meeting");
	});

	it("keeps every block of the note, in order, and does not touch the source", async () => {
		const host = await vault();
		const src = source();
		const before = JSON.stringify(src);
		await saveTemplate(host, "Meeting", src);
		expect(JSON.stringify(src)).toBe(before);
		const [entry] = (await listTemplates(host)).templates;
		expect(entry?.note?.blocks).toEqual(src.blocks);
	});

	it("keeps templates in folders, nested, and lists both", async () => {
		const host = await vault();
		await createTemplateFolder(host, "", "School");
		await createTemplateFolder(host, "School", "Year 2");
		await saveTemplate(host, "Lecture", source(), { folder: "School" });
		await saveTemplate(host, "Essay", source(), { folder: "School/Year 2" });
		await saveTemplate(host, "Meeting", source());
		expect(await names(host)).toEqual({
			folders: ["School", "School/Year 2"],
			templates: ["Meeting", "School/Lecture", "School/Year 2/Essay"],
		});
	});

	it("asks before reusing a name, and a replaced template is kept in recovery", async () => {
		const host = await vault();
		await saveTemplate(host, "Meeting", source());
		const again = await saveTemplate(host, "meeting", source());
		expect(again).toMatchObject({ ok: false, reason: "exists" });
		expect((await listTemplates(host)).templates.length).toBe(1);

		const other = source();
		other.blocks = [
			{ id: "z", type: "paragraph", parent: null, content: text("New") },
		];
		const replaced = await saveTemplate(host, "Meeting", other, {
			replace: true,
			now: WHEN,
		});
		expect(replaced).toMatchObject({ ok: true, replaced: true });
		expect((await listTemplates(host)).templates[0]?.preview).toBe("New");
		expect(await host.readText(`${RECOVERY}/Meeting.vnote`)).toContain(
			"Agenda",
		);
	});

	it("allows the same name in different folders", async () => {
		const host = await vault();
		await saveTemplate(host, "Notes", source());
		const inFolder = await saveTemplate(host, "Notes", source(), {
			folder: "School",
		});
		expect(inFolder).toMatchObject({ ok: true, replaced: false });
		expect((await names(host)).templates).toEqual(["Notes", "School/Notes"]);
	});

	it("refuses an empty name and a canvas", async () => {
		const host = await vault();
		expect(await saveTemplate(host, "  ", source())).toMatchObject({
			ok: false,
			reason: "invalid",
		});
		const canvas = source();
		canvas.header = { ...canvas.header, kind: "canvas" };
		expect(await saveTemplate(host, "Board", canvas)).toMatchObject({
			ok: false,
			reason: "invalid",
		});
		expect((await listTemplates(host)).templates).toEqual([]);
	});

	it("refuses a note that would not pass the save check", async () => {
		const host = await vault();
		const bad = source();
		bad.blocks.push({ id: "a", type: "paragraph", parent: null });
		expect(await saveTemplate(host, "Bad", bad)).toMatchObject({
			ok: false,
			reason: "invalid",
		});
		expect((await listTemplates(host)).templates).toEqual([]);
	});

	it("saves edits to a template and keeps its name and id", async () => {
		const host = await vault();
		const saved = await saveTemplate(host, "Meeting", source());
		if (!saved.ok) throw new Error("save failed");
		const before = (await listTemplates(host)).templates[0]?.note?.header
			.noteId;
		await updateTemplate(host, saved.path, [
			{ id: "n", type: "paragraph", parent: null, content: text("Edited") },
		]);
		const [entry] = (await listTemplates(host)).templates;
		expect(entry?.preview).toBe("Edited");
		expect(entry?.note?.header.noteId).toBe(before);
		expect(entry?.name).toBe("Meeting");
	});

	it("refuses to save edits that fail the save check, leaving the template as it was", async () => {
		const host = await vault();
		const saved = await saveTemplate(host, "Meeting", source());
		if (!saved.ok) throw new Error("save failed");
		const before = await host.readText(saved.path);
		await expect(
			updateTemplate(host, saved.path, [
				{ id: "x", type: "paragraph", parent: null },
				{ id: "x", type: "paragraph", parent: null },
			]),
		).rejects.toThrow(/can't be saved/);
		expect(await host.readText(saved.path)).toBe(before);
	});

	it("renames a template and keeps its blocks", async () => {
		const host = await vault();
		const saved = await saveTemplate(host, "Meeting", source());
		if (!saved.ok) throw new Error("save failed");
		const { path } = await renameTemplateEntry(host, saved.path, "Weekly sync");
		expect(path).toBe(`${TEMPLATES}/Weekly sync.vnote`);
		const list = (await listTemplates(host)).templates;
		expect(list.map((t) => t.name)).toEqual(["Weekly sync"]);
		expect(list[0]?.note?.header.title).toBe("Weekly sync");
		expect(list[0]?.note?.blocks).toEqual(source().blocks);
	});

	it("renames a folder with its templates inside", async () => {
		const host = await vault();
		await saveTemplate(host, "Lecture", source(), { folder: "School" });
		await renameTemplateEntry(host, `${TEMPLATES}/School`, "Classes");
		expect(await names(host)).toEqual({
			folders: ["Classes"],
			templates: ["Classes/Lecture"],
		});
	});

	it("will not rename onto another template or folder", async () => {
		const host = await vault();
		await saveTemplate(host, "A", source());
		const b = await saveTemplate(host, "B", source());
		if (!b.ok) throw new Error("save failed");
		await expect(renameTemplateEntry(host, b.path, "a")).rejects.toThrow(
			/already exists/,
		);
		expect((await names(host)).templates).toEqual(["A", "B"]);
	});

	it("duplicates next to the original with a free name", async () => {
		const host = await vault();
		const saved = await saveTemplate(host, "Meeting", source(), {
			folder: "Work",
		});
		if (!saved.ok) throw new Error("save failed");
		await duplicateTemplate(host, saved.path);
		await duplicateTemplate(host, saved.path);
		expect((await names(host)).templates).toEqual([
			"Work/Meeting",
			"Work/Meeting copy",
			"Work/Meeting copy 2",
		]);
	});

	it("removes by moving to recovery, never erasing", async () => {
		const host = await vault();
		const saved = await saveTemplate(host, "Meeting", source());
		if (!saved.ok) throw new Error("save failed");
		const before = await host.readText(saved.path);
		await removeTemplateEntry(host, saved.path, WHEN);
		expect((await listTemplates(host)).templates).toEqual([]);
		expect(await host.readText(`${RECOVERY}/Meeting.vnote`)).toBe(before);
	});

	it("removes a folder with everything in it, keeping the layout in recovery", async () => {
		const host = await vault();
		await saveTemplate(host, "Lecture", source(), { folder: "School" });
		await removeTemplateEntry(host, `${TEMPLATES}/School`, WHEN);
		expect(await names(host)).toEqual({ folders: [], templates: [] });
		expect(await host.kindOf(`${RECOVERY}/School/Lecture.vnote`)).toBe("file");
	});

	it("refuses paths outside the templates folder", async () => {
		const host = await vault();
		await host.writeTextAtomic("Note.vnote", "x");
		await expect(removeTemplateEntry(host, "Note.vnote")).rejects.toThrow();
		await expect(
			renameTemplateEntry(host, "Note.vnote", "X"),
		).rejects.toThrow();
		await expect(updateTemplate(host, "Note.vnote", [])).rejects.toThrow();
		expect(await host.kindOf("Note.vnote")).toBe("file");
	});

	it("lists a template it can't read, with a reason, and lets it be removed", async () => {
		const host = await vault();
		await host.makeFolder(TEMPLATES);
		await host.writeTextAtomic(`${TEMPLATES}/Broken.vnote`, "not a note");
		const [entry] = (await listTemplates(host)).templates;
		expect(entry).toMatchObject({ name: "Broken", note: null });
		expect(entry?.problem).toMatch(/could not be read/);
		await removeTemplateEntry(host, entry?.path ?? "");
		expect((await listTemplates(host)).templates).toEqual([]);
	});

	it("ignores other files in the folder", async () => {
		const host = await vault();
		await host.makeFolder(TEMPLATES);
		await host.writeTextAtomic(`${TEMPLATES}/readme.txt`, "x");
		expect((await listTemplates(host)).templates).toEqual([]);
	});
});

describe("templates and the rest of the vault", () => {
	it("leave the vault openable, out of the note list, and out of the health report", async () => {
		const host = await vault();
		await saveTemplate(host, "Meeting", source(), { folder: "Work" });
		const reopened = await openVault(host);
		expect(reopened.status).toBe("opened");
		expect(reopened.problems).toEqual([]);
		const scan = await scanVault(host);
		expect(scan.notes).toEqual([]);
		expect(scan.folders).toEqual([]);
		expect(scan.report).toEqual([]);
	});
});

describe("the template fixture", () => {
	it("is read back from the templates folder byte for byte, and fills in", async () => {
		const host = await vault();
		const text = readFileSync("test-fixtures/template.vnote", "utf8");
		await host.makeFolder(TEMPLATES);
		await host.writeTextAtomic(`${TEMPLATES}/Meeting.vnote`, text);
		const [entry] = (await listTemplates(host)).templates;
		expect(entry?.note?.blocks).toHaveLength(5);
		expect(entry?.problem).toBeUndefined();
		const blocks = blocksFromTemplate(entry?.note as Note, "Plan", NOW);
		expect(blocks[0]?.content).toEqual(text0("Plan"));
		expect(blocks[1]?.content).toEqual(text0("Date: 2026-11-08 at 16:05"));
		expect(await host.readText(`${TEMPLATES}/Meeting.vnote`)).toBe(text);
	});
});

describe("blocksFromTemplate", () => {
	it("gives every block a new id, keeps parents consistent, and fills the placeholders", () => {
		const blocks = blocksFromTemplate(source(), "Standup", NOW);
		expect(blocks.map((b) => b.type)).toEqual([
			"heading",
			"toggle",
			"paragraph",
			"paragraph",
		]);
		const ids = blocks.map((b) => b.id);
		expect(new Set(ids).size).toBe(4);
		expect(ids).not.toContain("a");
		expect(blocks[2]?.parent).toBe(blocks[1]?.id);
		expect(blocks[3]?.parent).toBe(blocks[1]?.id);
		expect(blocks[0]?.parent).toBeNull();
		expect(blocks[0]?.content).toEqual(text("Standup"));
		expect(blocks[2]?.content).toEqual(text("On 2026-11-08 at 16:05"));
	});

	it("leaves the template unchanged and other braces alone", () => {
		const src = source();
		src.blocks.push({
			id: "c",
			type: "paragraph",
			parent: null,
			content: text("{{other}} {title}"),
		});
		const before = JSON.stringify(src);
		const blocks = blocksFromTemplate(src, "T", NOW);
		expect(JSON.stringify(src)).toBe(before);
		expect(blocks[4]?.content).toEqual(text("{{other}} {title}"));
	});

	it("keeps attributes and marks", () => {
		const src = source();
		src.blocks = [
			{
				id: "h",
				type: "heading",
				parent: null,
				attrs: { level: 2 },
				content: [
					{ type: "text", text: "{{date}}", marks: [{ type: "bold" }] },
				],
			},
		];
		const [block] = blocksFromTemplate(src, "T", NOW);
		expect(block?.attrs).toEqual({ level: 2 });
		expect(block?.content).toEqual([
			{ type: "text", text: "2026-11-08", marks: [{ type: "bold" }] },
		]);
	});
});
