import { describe, expect, it } from "vitest";
import {
	type Block,
	type Note,
	parseNote,
	serializeNote,
} from "./note-format.js";

function header(extra: Record<string, never | string | number> = {}) {
	return {
		format: "vaultops-note" as const,
		v: 1,
		noteId: "n1",
		created: "2026-01-01T00:00:00Z",
		props: {},
		title: "T",
		...extra,
	};
}

function block(id: string, parent: string | null, extra: object = {}): Block {
	return { id, type: "paragraph", parent, ...extra };
}

function sampleNote(): Note {
	return {
		header: { ...header(), futureField: { b: [1, 2], a: null } },
		blocks: [
			block("b1", null, {
				type: "heading",
				attrs: { level: 1 },
				content: [{ type: "text", text: "Title \u{1F600} café 日本" }],
			}),
			block("b2", null, { type: "bulletList" }),
			block("b3", "b2", { type: "listItem" }),
			block("b4", "b3", {
				content: [
					{
						type: "text",
						text: "bold",
						marks: [{ type: "bold" }, { type: "link", attrs: { href: "x" } }],
					},
				],
			}),
			block("b5", null, {
				type: "weirdThing",
				zzz: { y: 1, x: [true] },
				aaa: 5,
			}),
		],
	};
}

function bigNote(n: number): Note {
	const blocks: Block[] = [];
	for (let i = 0; i < n; i++) {
		blocks.push(
			block(`id-${i}`, null, {
				content: [{ type: "text", text: `paragraph number ${i}` }],
			}),
		);
	}
	return { header: header(), blocks };
}

describe("round trip", () => {
	it("is lossless and byte-stable", () => {
		const n = sampleNote();
		const text = serializeNote(n);
		const parsed = parseNote(text);
		expect(parsed.note).toEqual(n);
		expect(parsed.problems).toEqual([]);
		expect(serializeNote(parsed.note as Note)).toBe(text);
	});
});

describe("canonical order", () => {
	it("sorts keys in the fixed order", () => {
		const input = [
			'{"title":"T","props":{"z":1,"a":2},"noteId":"n","v":1,"format":"vaultops-note","created":"c"}',
			'{"content":[{"text":"hi","type":"text"}],"attrs":{"b":1,"a":{"y":1,"x":2}},"parent":null,"type":"heading","id":"b1"}',
			'{"zed":1,"parent":"b1","id":"b2","type":"paragraph"}',
			"",
		].join("\n");
		const out = serializeNote(parseNote(input).note as Note);
		expect(out).toBe(
			[
				'{"format":"vaultops-note","v":1,"noteId":"n","created":"c","props":{"a":2,"z":1},"title":"T"}',
				'{"id":"b1","type":"heading","parent":null,"attrs":{"a":{"x":2,"y":1},"b":1},"content":[{"text":"hi","type":"text"}]}',
				'{"id":"b2","type":"paragraph","parent":"b1","zed":1}',
				"",
			].join("\n"),
		);
	});
});

describe("damaged files", () => {
	it("returns complete blocks from a truncated file", () => {
		const text = serializeNote(bigNote(12));
		const cut = text.slice(0, Math.floor(text.length * 0.7));
		const lines = cut.split("\n");
		const r = parseNote(cut);
		expect(r.note).not.toBeNull();
		expect(r.skippedLines).toEqual([lines.length]);
		expect(r.note?.blocks.length).toBe(lines.length - 2);
		expect(r.note?.blocks.map((b) => b.id)).toEqual(
			bigNote(12)
				.blocks.slice(0, lines.length - 2)
				.map((b) => b.id),
		);
	});

	it("skips a corrupt middle line", () => {
		const lines = serializeNote(bigNote(5)).split("\n");
		lines[3] = "{not json";
		const r = parseNote(lines.join("\n"));
		expect(r.skippedLines).toEqual([4]);
		expect(
			r.problems.some((p) => p.kind === "invalid-json" && p.line === 4),
		).toBe(true);
		expect(r.note?.blocks.map((b) => b.id)).toEqual([
			"id-0",
			"id-1",
			"id-3",
			"id-4",
		]);
	});

	it("skips an empty middle line", () => {
		const lines = serializeNote(bigNote(3)).split("\n");
		lines.splice(2, 0, "");
		const r = parseNote(lines.join("\n"));
		expect(r.skippedLines).toEqual([3]);
		expect(r.note?.blocks.length).toBe(3);
	});

	it("reports bad-block", () => {
		const text = `${serializeNote(bigNote(1))}{"foo":1}\n`;
		const r = parseNote(text);
		expect(r.skippedLines).toEqual([3]);
		expect(r.problems).toContainEqual(
			expect.objectContaining({ kind: "bad-block", line: 3 }),
		);
		expect(r.note?.blocks.length).toBe(1);
	});
});

describe("header", () => {
	it.each([
		["not JSON", "hello\n"],
		["wrong format", '{"format":"other","v":1,"noteId":"n"}\n'],
		["missing noteId", '{"format":"vaultops-note","v":1}\n'],
		["non-numeric v", '{"format":"vaultops-note","v":"1","noteId":"n"}\n'],
		["array", "[]\n"],
	])("rejects %s", (_name, text) => {
		const r = parseNote(text);
		expect(r.note).toBeNull();
		expect(r.problems.map((p) => p.kind)).toEqual(["bad-header"]);
	});

	it("accepts a newer version with a problem", () => {
		const n = bigNote(1);
		n.header.v = 2;
		const r = parseNote(serializeNote(n));
		expect(r.note).not.toBeNull();
		expect(r.problems).toContainEqual(
			expect.objectContaining({ kind: "newer-version", line: 1 }),
		);
	});

	it("handles empty and header-only files", () => {
		const empty = parseNote("");
		expect(empty.note).toBeNull();
		expect(empty.problems[0]?.kind).toBe("bad-header");
		const only = parseNote(serializeNote({ header: header(), blocks: [] }));
		expect(only.note?.blocks).toEqual([]);
		expect(only.problems).toEqual([]);
	});
});

describe("id problems", () => {
	function parseBlocks(blocks: object[]) {
		const text = `${serializeNote({ header: header(), blocks: [] })}${blocks
			.map((b) => `${JSON.stringify(b)}\n`)
			.join("")}`;
		return parseNote(text).problems;
	}

	it("reports missing-id", () => {
		const p = parseBlocks([{ type: "paragraph", parent: null }]);
		expect(p).toEqual([
			expect.objectContaining({ kind: "missing-id", line: 2 }),
		]);
	});

	it("reports duplicate-id on the second occurrence", () => {
		const p = parseBlocks([
			block("a", null),
			block("b", null),
			block("a", null),
		]);
		expect(p).toEqual([
			expect.objectContaining({ kind: "duplicate-id", line: 4, blockId: "a" }),
		]);
	});

	it("reports inline-id for id and attrs.id, including nested", () => {
		const p = parseBlocks([
			block("a", null),
			block("b", null, { content: [{ type: "text", text: "x", id: "i1" }] }),
			block("c", null, {
				content: [{ type: "mention", attrs: { id: "i2" } }],
			}),
			block("d", null, {
				content: [
					{
						type: "span",
						content: [{ type: "text", marks: [{ type: "m", id: "i3" }] }],
					},
				],
			}),
		]);
		expect(p.map((x) => [x.kind, x.line])).toEqual([
			["inline-id", 3],
			["inline-id", 4],
			["inline-id", 5],
		]);
	});

	it("reports orphan-parent for unknown and later parents", () => {
		const p = parseBlocks([
			block("a", "later"),
			block("later", null),
			block("c", "nope"),
		]);
		expect(p.map((x) => [x.kind, x.line])).toEqual([
			["orphan-parent", 2],
			["orphan-parent", 4],
		]);
	});
});

describe("serialize output", () => {
	it("ends with exactly one newline and has no CR", () => {
		const text = serializeNote(sampleNote());
		expect(text.endsWith("\n")).toBe(true);
		expect(text.endsWith("\n\n")).toBe(false);
		expect(text).not.toContain("\r");
	});
});

describe("line numbers after a skipped line", () => {
	it("reports id problems at their real file line", () => {
		const text = [
			'{"format":"vaultops-note","v":1,"noteId":"n1"}',
			'{"id":"a","type":"paragraph","parent":null}',
			"not json",
			'{"id":"a","type":"paragraph","parent":null}',
		].join("\n");
		const result = parseNote(text);
		expect(result.skippedLines).toEqual([3]);
		const dup = result.problems.find((p) => p.kind === "duplicate-id");
		expect(dup?.line).toBe(4);
	});
});
