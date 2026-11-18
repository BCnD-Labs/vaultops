import { describe, expect, it } from "vitest";
import { localGraph, type MentionNote, mentionsOf } from "./mentions";

const row = (
	id: string,
	title: string,
	text = "",
	links: string[] = [],
	kind?: "note" | "canvas",
): MentionNote => ({ id, path: `${id}.vnote`, title, text, links, kind });

describe("mentionsOf", () => {
	it("matches whole words ignoring case and accents, skips linked notes and short titles", () => {
		const notes = [
			row("target", "Café", "Café notes"),
			row("hit1", "Beta", "We met at the cafe yesterday."),
			row("hit2", "Alpha", "Great CAFE\u0301 in town!"),
			row("partial", "Partial", "The cafeteria was closed."),
			row("linked", "Already", "See cafe here", ["target"]),
			row("canvas", "Board", "cafe on board", [], "canvas"),
		];
		expect(mentionsOf(notes, "target", "Café")).toEqual([
			{ note: notes[2], snippet: "Great CAFE\u0301 in town!" },
			{ note: notes[1], snippet: "We met at the cafe yesterday." },
		]);
		expect(mentionsOf(notes, "target", "ab")).toEqual([]);
		expect(mentionsOf(notes, undefined, "Café")).toEqual([]);
	});

	it("clips long snippets with ellipses around the mention", () => {
		const body = `${"a".repeat(45)} target word ${"b".repeat(65)}`;
		const [hit] = mentionsOf([row("n1", "One", body)], "t", "target");
		expect(hit?.snippet.startsWith("…")).toBe(true);
		expect(hit?.snippet.endsWith("…")).toBe(true);
		expect(hit?.snippet).toContain("target");
	});
});

describe("localGraph", () => {
	it("places current note at center, 1st and 2nd hops on rings, and caps at maxNodes", () => {
		const notes = [
			row("root", "Root", "", ["out1"]),
			row("out1", "Out", "", ["hop2"]),
			row("in1", "In", "", ["root"]),
			row("hop2", "Second"),
			row("far", "Unconnected"),
		];
		const g = localGraph(notes, "root");
		expect(g.nodes.map((n) => [n.id, n.hop])).toEqual([
			["root", 0],
			["in1", 1],
			["out1", 1],
			["hop2", 2],
		]);
		expect(g.nodes[0]).toMatchObject({ x: 110, y: 110 });
		expect(g.edges.map((e) => [e.from, e.to])).toEqual([
			["root", "out1"],
			["in1", "root"],
			["out1", "hop2"],
		]);
		const many = Array.from({ length: 40 }, (_, i) =>
			row(`n${i}`, `Note ${i}`, "", ["root"]),
		);
		expect(localGraph([...notes, ...many], "root").nodes).toHaveLength(30);
	});
});
