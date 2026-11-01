import { describe, expect, it } from "vitest";
import { ancestorsOf, buildTree, type TreeNode } from "./tree";

const note = (path: string, title = path, readOnly = false) => ({
	path,
	title,
	readOnly,
});

/** The tree as indented names, so the shape is easy to read in a test. */
function outline(nodes: TreeNode[], depth = 0): string[] {
	return nodes.flatMap((n) => [
		`${"  ".repeat(depth)}${n.kind === "folder" ? `${n.name}/` : n.name}`,
		...(n.kind === "folder" ? outline(n.children, depth + 1) : []),
	]);
}

describe("buildTree", () => {
	it("shows nested folders and notes exactly as they are, empty folders included", () => {
		const tree = buildTree(
			["Class", "Class/Week 1", "Empty"],
			[
				note("Home.vnote", "Home"),
				note("Class/Syllabus.vnote", "Syllabus"),
				note("Class/Week 1/Lecture.vnote", "Lecture 1"),
			],
		);
		expect(outline(tree)).toEqual([
			"Class/",
			"  Week 1/",
			"    Lecture 1",
			"  Syllabus",
			"Empty/",
			"Home",
		]);
	});

	it("puts folders before notes and sorts each by name ignoring case", () => {
		const tree = buildTree(
			["zeta", "Alpha"],
			[note("b.vnote", "banana"), note("a.vnote", "Apple")],
		);
		expect(outline(tree)).toEqual(["Alpha/", "zeta/", "Apple", "banana"]);
	});

	it("hides .vaultops, in any capitalization, and everything in it", () => {
		const tree = buildTree(
			[".vaultops", ".vaultops/trash", ".VaultOps/history", "Real"],
			[
				note(".vaultops/trash/x/Old.vnote", "Old"),
				note(".VAULTOPS/Old2.vnote", "Old2"),
				note("Real/Keep.vnote", "Keep"),
			],
		);
		expect(outline(tree)).toEqual(["Real/", "  Keep"]);
	});

	it("keeps a note whose folder was not listed, so no note goes missing", () => {
		expect(outline(buildTree([], [note("a/b/n.vnote", "N")]))).toEqual([
			"a/",
			"  b/",
			"    N",
		]);
	});

	it("carries the path and read-only flag on each node", () => {
		const [first] = buildTree([], [note("n.vnote", "N", true)]);
		expect(first).toEqual({
			kind: "note",
			name: "N",
			path: "n.vnote",
			readOnly: true,
		});
	});

	it("is empty for an empty vault", () => {
		expect(buildTree([], [])).toEqual([]);
	});
});

describe("ancestorsOf", () => {
	it("lists the folders above a path, outermost first", () => {
		expect(ancestorsOf("a/b/n.vnote")).toEqual(["a", "a/b"]);
		expect(ancestorsOf("n.vnote")).toEqual([]);
	});
});
