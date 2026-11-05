import { describe, expect, it } from "vitest";
import {
	closeSplit,
	closeTab,
	emptyWorkspace,
	focusPane,
	moveTab,
	NEW_TAB,
	openDoc,
	openEmptyTab,
	paneWithTab,
	pruneDocs,
	renameDoc,
	restore,
	saveable,
	selectTab,
	shownDocs,
	splitFrom,
	type Workspace,
} from "./workspace";

const isCanvas = (path: string) => path.startsWith("c/");

function opened(...paths: string[]): Workspace {
	return paths.reduce(
		(ws, path) => openDoc(ws, path, isCanvas),
		emptyWorkspace(),
	);
}

describe("opening", () => {
	it("opens tabs in order and shows the newest", () => {
		const ws = opened("a", "b");
		expect(ws.left).toEqual({ tabs: ["a", "b"], active: "b" });
		expect(ws.right).toBeNull();
	});

	it("shows a document that already has a tab instead of adding another", () => {
		const ws = openDoc(opened("a", "b"), "a", isCanvas);
		expect(ws.left).toEqual({ tabs: ["a", "b"], active: "a" });
	});

	it("takes over the pane's empty tab", () => {
		const ws = openDoc(openEmptyTab(opened("a")), "b", isCanvas);
		expect(ws.left).toEqual({ tabs: ["a", "b"], active: "b" });
	});

	it("opens in the focused pane, and finds a document wherever it is", () => {
		let ws = splitFrom(opened("a", "b"), "a", isCanvas);
		expect(ws.right).toEqual({ tabs: ["a"], active: "a" });
		expect(ws.focused).toBe("right");
		ws = openDoc(ws, "c", isCanvas);
		expect(ws.right?.tabs).toEqual(["a", "c"]);
		ws = openDoc(ws, "b", isCanvas);
		expect(ws.focused).toBe("left");
		expect(ws.left.active).toBe("b");
		ws = openDoc(ws, "a", isCanvas);
		expect(ws.focused).toBe("right");
		expect(ws.right?.active).toBe("a");
	});

	it("opens in a named pane, falling back to the left when there is no right", () => {
		expect(openDoc(opened("a"), "b", isCanvas, "right").left.tabs).toEqual([
			"a",
			"b",
		]);
		const split = splitFrom(opened("a", "b"), "a", isCanvas);
		expect(openDoc(split, "z", isCanvas, "left").left.tabs).toEqual(["b", "z"]);
	});
});

describe("two canvases never show together", () => {
	it("opens a second canvas in the pane that already shows one", () => {
		let ws = openDoc(opened("n", "c/1"), "c/2", isCanvas);
		ws = splitFrom(ws, "n", isCanvas);
		// n moved right; left shows canvas 2.
		ws = openDoc(ws, "c/3", isCanvas, "right");
		expect(paneWithTab(ws, "c/3")).toBe("left");
		expect(ws.left.active).toBe("c/3");
	});

	it("steps the other pane aside to its nearest note when a canvas is chosen", () => {
		let ws = opened("n", "m", "c/1");
		ws = splitFrom(ws, "n", isCanvas);
		// right: n; left: m, c/1 (showing c/1)
		expect(ws.left.active).toBe("c/1");
		ws = selectTab(ws, "right", "n", isCanvas);
		const moved = moveTab(ws, "c/1", "right", undefined, isCanvas);
		expect(moved.right?.active).toBe("c/1");
		expect(shownDocs(moved).filter(isCanvas)).toHaveLength(1);
	});

	it("falls back to the empty tab when the other pane has only canvases", () => {
		let ws = opened("n", "c/1");
		ws = splitFrom(ws, "n", isCanvas); // right: n, left: c/1
		ws = openDoc(ws, "c/2", isCanvas, "right"); // goes to the pane showing a canvas
		expect(ws.left.tabs).toEqual(["c/1", "c/2"]);
		expect(ws.left.active).toBe("c/2");
		expect(ws.right?.active).toBe("n");
		ws = moveTab(ws, "n", "left", undefined, isCanvas);
		// right emptied: the split closed.
		expect(ws.right).toBeNull();
	});
});

describe("closing", () => {
	it("shows the right-hand neighbor, else the left", () => {
		expect(closeTab(opened("a", "b", "c"), "c").left.active).toBe("b");
		const ws = selectTab(opened("a", "b", "c"), "left", "b", isCanvas);
		expect(closeTab(ws, "b").left).toEqual({ tabs: ["a", "c"], active: "c" });
	});

	it("leaves the active tab alone when another one closes", () => {
		expect(closeTab(opened("a", "b"), "a").left).toEqual({
			tabs: ["b"],
			active: "b",
		});
	});

	it("closes the right pane when its last tab closes", () => {
		const ws = splitFrom(opened("a", "b"), "a", isCanvas);
		const closed = closeTab(ws, "a");
		expect(closed.right).toBeNull();
		expect(closed.focused).toBe("left");
		expect(closed.left.tabs).toEqual(["b"]);
	});

	it("lets the right pane become the only pane when the left one empties", () => {
		const ws = splitFrom(opened("a", "b"), "a", isCanvas);
		const closed = closeTab(ws, "b");
		expect(closed.right).toBeNull();
		expect(closed.left).toEqual({ tabs: ["a"], active: "a" });
	});

	it("ignores a path with no tab", () => {
		const ws = opened("a");
		expect(closeTab(ws, "zzz")).toBe(ws);
	});
});

describe("splitting", () => {
	it("starts the right pane empty when the tab being looked at is split", () => {
		const ws = splitFrom(opened("a", "b"), "b", isCanvas);
		expect(ws.left).toEqual({ tabs: ["a", "b"], active: "b" });
		expect(ws.right).toEqual({ tabs: [NEW_TAB], active: NEW_TAB });
		expect(ws.focused).toBe("right");
	});

	it("moves a tab that isn't showing into the right pane", () => {
		const ws = splitFrom(opened("a", "b", "c"), "a", isCanvas);
		expect(ws.left).toEqual({ tabs: ["b", "c"], active: "c" });
		expect(ws.right).toEqual({ tabs: ["a"], active: "a" });
	});

	it("starts empty when the only tab is split", () => {
		const ws = splitFrom(opened("a"), "a", isCanvas);
		expect(ws.left.tabs).toEqual(["a"]);
		expect(ws.right?.active).toBe(NEW_TAB);
	});

	it("moves a tab to the right pane once the view is split", () => {
		let ws = splitFrom(opened("a", "b", "c"), "a", isCanvas);
		ws = splitFrom(ws, "b", isCanvas);
		expect(ws.right?.tabs).toEqual(["a", "b"]);
		expect(ws.right?.active).toBe("b");
		expect(ws.left.tabs).toEqual(["c"]);
	});

	it("closes the split by joining the right tabs to the left", () => {
		const ws = closeSplit(splitFrom(opened("a", "b", "c"), "a", isCanvas));
		expect(ws.right).toBeNull();
		expect(ws.left).toEqual({ tabs: ["b", "c", "a"], active: "c" });
	});

	it("closing a split of an empty right pane just closes it", () => {
		const ws = closeSplit(splitFrom(opened("a"), "a", isCanvas));
		expect(ws.left).toEqual({ tabs: ["a"], active: "a" });
	});
});

describe("moving tabs", () => {
	it("reorders within a pane", () => {
		const ws = moveTab(opened("a", "b", "c"), "c", "left", 0, isCanvas);
		expect(ws.left.tabs).toEqual(["c", "a", "b"]);
		expect(ws.left.active).toBe("c");
	});

	it("moves between panes at a position and shows it there", () => {
		let ws = splitFrom(opened("a", "b", "c", "d"), "a", isCanvas);
		ws = moveTab(ws, "b", "right", 0, isCanvas);
		expect(ws.right).toEqual({ tabs: ["b", "a"], active: "b" });
		expect(ws.left.tabs).toEqual(["c", "d"]);
		expect(ws.focused).toBe("right");
	});

	it("will not drag the only tab out into a new right pane", () => {
		const ws = opened("a");
		expect(moveTab(ws, "a", "right", undefined, isCanvas)).toBe(ws);
	});

	it("drops the empty tab from a pane that receives a document", () => {
		let ws = splitFrom(opened("a", "b"), "b", isCanvas); // right: new tab
		ws = moveTab(ws, "a", "right", undefined, isCanvas);
		expect(ws.right).toEqual({ tabs: ["a"], active: "a" });
	});
});

describe("renaming, pruning, remembering", () => {
	it("renames a tab in place in either pane", () => {
		const ws = splitFrom(opened("a", "b", "c"), "a", isCanvas);
		const renamed = renameDoc(renameDoc(ws, "a", "x"), "b", "y");
		expect(renamed.right).toEqual({ tabs: ["x"], active: "x" });
		expect(renamed.left.tabs).toEqual(["y", "c"]);
	});

	it("keeps one tab when a rename lands on an existing path", () => {
		const ws = renameDoc(opened("a", "b"), "a", "b");
		expect(ws.left.tabs).toEqual(["b"]);
	});

	it("prunes missing documents and keeps the empty tab", () => {
		const ws = pruneDocs(
			openEmptyTab(opened("a", "gone", "b")),
			(p) => p !== "gone",
		);
		expect(ws.left.tabs).toEqual(["a", "b", NEW_TAB]);
		expect(ws.left.active).toBe(NEW_TAB);
	});

	it("collapses a pane that loses all its tabs to pruning", () => {
		const ws = splitFrom(opened("a", "b"), "a", isCanvas);
		const pruned = pruneDocs(ws, (p) => p !== "a");
		expect(pruned.right).toBeNull();
		expect(pruned.left.tabs).toEqual(["b"]);
	});

	it("saves document tabs only and restores them with nothing active", () => {
		const ws = openEmptyTab(
			splitFrom(opened("a", "b", "c"), "a", isCanvas),
			"right",
		);
		expect(saveable(ws)).toEqual({ left: ["b", "c"], right: ["a"] });
		const back = restore(saveable(ws));
		expect(back.left).toEqual({ tabs: ["b", "c"], active: null });
		expect(back.right).toEqual({ tabs: ["a"], active: null });
		expect(restore({ left: [], right: ["z"] }).left.tabs).toEqual(["z"]);
	});

	it("focuses a pane only when it exists", () => {
		const ws = opened("a");
		expect(focusPane(ws, "right")).toBe(ws);
		const split = splitFrom(opened("a", "b"), "a", isCanvas);
		expect(focusPane(split, "left").focused).toBe("left");
	});
});

describe("closing a tab that both panes have", () => {
	it("closes the empty tab of the named pane only", () => {
		let ws = splitFrom(opened("a", "b"), "a", isCanvas);
		ws = openEmptyTab(openEmptyTab(ws, "left"), "right");
		expect(ws.left.tabs).toContain(NEW_TAB);
		expect(ws.right?.tabs).toContain(NEW_TAB);
		const next = closeTab(ws, NEW_TAB, "right");
		expect(next.right?.tabs).toEqual(["a"]);
		expect(next.left.tabs).toContain(NEW_TAB);
	});

	it("falls back to wherever the tab is when the named pane lacks it", () => {
		const ws = splitFrom(opened("a", "b"), "a", isCanvas);
		const next = closeTab(ws, "b", "right");
		// Left emptied, so the right pane takes its place.
		expect(next.left.tabs).toEqual(["a"]);
		expect(next.right).toBeNull();
	});
});

describe("opening from the empty tab", () => {
	it("uses the empty tab up when the document is already open", () => {
		const ws = openDoc(openEmptyTab(opened("a", "b")), "a", isCanvas);
		expect(ws.left).toEqual({ tabs: ["a", "b"], active: "a" });
	});

	it("leaves the empty tab alone when its pane is not the one asked", () => {
		// The empty tab is in the right pane; opening in the left keeps it.
		let ws = splitFrom(opened("a", "b"), "b", isCanvas);
		ws = openDoc(ws, "a", isCanvas, "left");
		expect(ws.right?.tabs).toEqual([NEW_TAB]);
	});

	it("selecting a tab keeps the empty tab", () => {
		const ws = selectTab(openEmptyTab(opened("a", "b")), "left", "a", isCanvas);
		expect(ws.left).toEqual({ tabs: ["a", "b", NEW_TAB], active: "a" });
	});

	it("closes a right pane whose only tab was the empty tab", () => {
		const split = splitFrom(opened("a", "b"), "b", isCanvas);
		expect(split.right?.tabs).toEqual([NEW_TAB]);
		const ws = openDoc(split, "a", isCanvas);
		expect(ws.right).toBeNull();
		expect(ws.left.active).toBe("a");
	});
});

describe("splitting from a canvas", () => {
	it("moves the canvas being looked at to the right, with a note beside it", () => {
		const ws = splitFrom(opened("n", "c/1"), "c/1", isCanvas);
		expect(ws.left).toEqual({ tabs: ["n"], active: "n" });
		expect(ws.right).toEqual({ tabs: ["c/1"], active: "c/1" });
		expect(ws.focused).toBe("right");
	});

	it("starts an empty right pane when the canvas is the only tab", () => {
		const ws = splitFrom(opened("c/1"), "c/1", isCanvas);
		expect(ws.left).toEqual({ tabs: ["c/1"], active: "c/1" });
		expect(ws.right).toEqual({ tabs: [NEW_TAB], active: NEW_TAB });
	});

	it("still keeps a note being looked at on the left", () => {
		const ws = splitFrom(opened("c/1", "n"), "n", isCanvas);
		expect(ws.left.active).toBe("n");
		expect(ws.right).toEqual({ tabs: [NEW_TAB], active: NEW_TAB });
	});
});
