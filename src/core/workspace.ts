/**
 * The editor workspace as pure data: up to two panes side by side, each with its
 * own tabs and one active tab. Nothing here touches the editor, the window or
 * the disk, so the rules for opening, moving, splitting and closing tabs are
 * tested on their own and the screen just renders the result.
 *
 * A tab is a note or canvas path, or NEW_TAB (the empty tab). A path has at most
 * one tab in the whole workspace, and two canvases are never shown together.
 */

/**
 * The id of the empty tab. It holds no document, and a NUL can't be in a file
 * name, so it never clashes with a path.
 */
export const NEW_TAB = "\u0000new-tab";

export type PaneId = "left" | "right";

export interface Pane {
	tabs: string[];
	/** The tab being shown, or null when the pane has no tab. */
	active: string | null;
}

export interface Workspace {
	left: Pane;
	/** Null until the view is split. */
	right: Pane | null;
	focused: PaneId;
}

/** Whether a path is a canvas (the app answers this from the vault's notes). */
export type IsCanvas = (path: string) => boolean;

export function emptyWorkspace(): Workspace {
	return { left: { tabs: [], active: null }, right: null, focused: "left" };
}

const other = (pane: PaneId): PaneId => (pane === "left" ? "right" : "left");

function paneOf(ws: Workspace, id: PaneId): Pane | null {
	return id === "left" ? ws.left : ws.right;
}

function withPane(ws: Workspace, id: PaneId, pane: Pane | null): Workspace {
	return id === "left"
		? { ...ws, left: pane ?? ws.left }
		: { ...ws, right: pane };
}

/** Which pane has a tab for the path, if any. */
export function paneWithTab(ws: Workspace, path: string): PaneId | null {
	if (ws.left.tabs.includes(path)) return "left";
	if (ws.right?.tabs.includes(path)) return "right";
	return null;
}

/** The documents being shown, one per pane (empty tabs and empty panes left out). */
export function shownDocs(ws: Workspace): string[] {
	return [ws.left.active, ws.right?.active ?? null].filter(
		(path): path is string => path !== null && path !== NEW_TAB,
	);
}

function neighbor(tabs: string[], index: number): string | null {
	return tabs[index] ?? tabs[index - 1] ?? null;
}

/** Take a path out of a pane's tabs; if it was showing, the neighbor shows. */
function without(pane: Pane, path: string): Pane {
	const index = pane.tabs.indexOf(path);
	if (index < 0) return pane;
	const tabs = pane.tabs.filter((tab) => tab !== path);
	return {
		tabs,
		active: pane.active === path ? neighbor(tabs, index) : pane.active,
	};
}

/** An emptied right pane closes; an emptied left pane gives way to the right one. */
function settled(ws: Workspace): Workspace {
	if (ws.right && ws.right.tabs.length === 0)
		return { ...ws, right: null, focused: "left" };
	if (ws.left.tabs.length === 0 && ws.right)
		return { left: ws.right, right: null, focused: "left" };
	return ws;
}

/** If two canvases would show, the one in `keep`'s other pane steps aside. */
function singleCanvas(
	ws: Workspace,
	isCanvas: IsCanvas,
	keep: PaneId,
): Workspace {
	const mine = paneOf(ws, keep);
	const theirsId = other(keep);
	const theirs = paneOf(ws, theirsId);
	if (!mine?.active || !theirs?.active) return ws;
	if (!isCanvas(mine.active) || !isCanvas(theirs.active)) return ws;
	// Show the nearest tab that is not a canvas, else the empty tab.
	const index = theirs.tabs.indexOf(theirs.active);
	const candidates = [
		...theirs.tabs.slice(index + 1),
		...theirs.tabs.slice(0, index).reverse(),
	];
	const fallback = candidates.find((tab) => !isCanvas(tab)) ?? null;
	if (fallback) return withPane(ws, theirsId, { ...theirs, active: fallback });
	return withPane(ws, theirsId, {
		tabs: theirs.tabs.includes(NEW_TAB)
			? theirs.tabs
			: [...theirs.tabs, NEW_TAB],
		active: NEW_TAB,
	});
}

/**
 * Show a document. If it already has a tab it is shown there (in either pane);
 * otherwise it opens in `pane` (default: the focused one), taking over that
 * pane's empty tab if that is what was showing. A canvas goes to the pane that
 * already shows a canvas, since two never show together.
 */
export function openDoc(
	ws: Workspace,
	path: string,
	isCanvas: IsCanvas,
	pane?: PaneId,
): Workspace {
	const existing = paneWithTab(ws, path);
	if (existing) {
		const target = paneOf(ws, existing) as Pane;
		return singleCanvas(
			{
				...withPane(ws, existing, { ...target, active: path }),
				focused: existing,
			},
			isCanvas,
			existing,
		);
	}
	let dest: PaneId = pane ?? ws.focused;
	if (dest === "right" && !ws.right) dest = "left";
	if (isCanvas(path) && ws.right) {
		const holder = (["left", "right"] as const).find((id) => {
			const active = paneOf(ws, id)?.active;
			return active !== null && active !== undefined && isCanvas(active);
		});
		if (holder) dest = holder;
	}
	const target = paneOf(ws, dest) as Pane;
	const replacing = target.active === NEW_TAB;
	const tabs = replacing
		? target.tabs.map((tab) => (tab === NEW_TAB ? path : tab))
		: [...target.tabs, path];
	return singleCanvas(
		{ ...withPane(ws, dest, { tabs, active: path }), focused: dest },
		isCanvas,
		dest,
	);
}

/** Show the pane's empty tab, adding it if the pane has none. */
export function openEmptyTab(
	ws: Workspace,
	pane: PaneId = ws.focused,
): Workspace {
	const target = paneOf(ws, pane);
	if (!target) return ws;
	const tabs = target.tabs.includes(NEW_TAB)
		? target.tabs
		: [...target.tabs, NEW_TAB];
	return { ...withPane(ws, pane, { tabs, active: NEW_TAB }), focused: pane };
}

/** Show a tab that is already in the pane, and focus the pane. */
export function selectTab(
	ws: Workspace,
	pane: PaneId,
	path: string,
	isCanvas: IsCanvas,
): Workspace {
	const target = paneOf(ws, pane);
	if (!target?.tabs.includes(path)) return ws;
	return singleCanvas(
		{ ...withPane(ws, pane, { ...target, active: path }), focused: pane },
		isCanvas,
		pane,
	);
}

/**
 * Close a tab wherever it is. An emptied pane closes with it. Name the pane
 * when the path may be in both: each pane can have its own empty tab.
 */
export function closeTab(
	ws: Workspace,
	path: string,
	pane?: PaneId,
): Workspace {
	const id =
		pane && paneOf(ws, pane)?.tabs.includes(path)
			? pane
			: paneWithTab(ws, path);
	if (!id) return ws;
	const next = withPane(ws, id, without(paneOf(ws, id) as Pane, path));
	return settled(next);
}

/**
 * Split the view from a tab. A tab that isn't the one being looked at moves to
 * a new right pane; the tab being looked at stays and the right pane starts
 * with an empty tab. With a split already open, the tab moves to the right.
 */
export function splitFrom(
	ws: Workspace,
	path: string,
	isCanvas: IsCanvas,
): Workspace {
	const from = paneWithTab(ws, path);
	if (!from) return ws;
	if (!ws.right) {
		const left = ws.left;
		if (left.active === path || left.tabs.length === 1) {
			return {
				...ws,
				right: { tabs: [NEW_TAB], active: NEW_TAB },
				focused: "right",
			};
		}
		return singleCanvas(
			{
				left: without(left, path),
				right: { tabs: [path], active: path },
				focused: "right",
			},
			isCanvas,
			"right",
		);
	}
	return moveTab(ws, path, "right", undefined, isCanvas);
}

/**
 * Move a tab to a pane (creating the right pane when it doesn't exist yet) or
 * to a new place in its own pane. The moved tab shows in its new pane.
 */
export function moveTab(
	ws: Workspace,
	path: string,
	to: PaneId,
	index: number | undefined,
	isCanvas: IsCanvas,
): Workspace {
	const from = paneWithTab(ws, path);
	if (!from) return ws;
	if (from === to) {
		const pane = paneOf(ws, from) as Pane;
		const rest = pane.tabs.filter((tab) => tab !== path);
		const at = Math.min(Math.max(index ?? rest.length, 0), rest.length);
		const tabs = [...rest.slice(0, at), path, ...rest.slice(at)];
		return withPane(ws, from, { ...pane, tabs });
	}
	// Moving the only tab of the left pane out would leave nothing to split from.
	if (to === "right" && !ws.right && ws.left.tabs.length === 1) return ws;
	const source = without(paneOf(ws, from) as Pane, path);
	const destPane = paneOf(ws, to) ?? { tabs: [], active: null };
	const tabs = destPane.tabs.filter((tab) => tab !== path && tab !== NEW_TAB);
	const at = Math.min(Math.max(index ?? tabs.length, 0), tabs.length);
	const merged: Pane = {
		tabs: [...tabs.slice(0, at), path, ...tabs.slice(at)],
		active: path,
	};
	let next = withPane(withPane(ws, from, source), to, merged);
	next = { ...next, focused: to };
	// Panes can renumber when one empties, so find where the moved tab ended up.
	const result = settled(next);
	return singleCanvas(result, isCanvas, paneWithTab(result, path) ?? to);
}

/** Close the split: the right pane's tabs join the left pane's. */
export function closeSplit(ws: Workspace): Workspace {
	if (!ws.right) return ws;
	const joined = ws.right.tabs.filter(
		(tab) => !ws.left.tabs.includes(tab) && tab !== NEW_TAB,
	);
	const tabs = [...ws.left.tabs, ...joined];
	const active =
		ws.left.active && ws.left.active !== NEW_TAB
			? ws.left.active
			: ws.right.active && ws.right.active !== NEW_TAB
				? ws.right.active
				: (tabs[0] ?? null);
	return { left: { tabs, active }, right: null, focused: "left" };
}

export function focusPane(ws: Workspace, pane: PaneId): Workspace {
	return pane === "right" && !ws.right ? ws : { ...ws, focused: pane };
}

/** A renamed or moved document keeps its tab, in the same place. */
export function renameDoc(ws: Workspace, from: string, to: string): Workspace {
	if (from === to) return ws;
	const fix = (pane: Pane): Pane => {
		if (!pane.tabs.includes(from)) return pane;
		const mapped = pane.tabs.map((tab) => (tab === from ? to : tab));
		return {
			tabs: mapped.filter((tab, i) => mapped.indexOf(tab) === i),
			active: pane.active === from ? to : pane.active,
		};
	};
	return { ...ws, left: fix(ws.left), right: ws.right ? fix(ws.right) : null };
}

/** Drop tabs whose document no longer exists (the empty tab always stays). */
export function pruneDocs(
	ws: Workspace,
	exists: (path: string) => boolean,
): Workspace {
	let next = ws;
	for (const id of ["left", "right"] as const) {
		const pane = paneOf(next, id);
		if (!pane) continue;
		for (const tab of pane.tabs) {
			if (tab !== NEW_TAB && !exists(tab)) next = closeTab(next, tab);
		}
	}
	return next;
}

/** What is worth remembering across restarts: the document tabs of each pane. */
export interface SavedWorkspace {
	left: string[];
	right: string[];
}

export function saveable(ws: Workspace): SavedWorkspace {
	const docs = (pane: Pane | null) =>
		pane ? pane.tabs.filter((tab) => tab !== NEW_TAB) : [];
	return { left: docs(ws.left), right: docs(ws.right) };
}

export function restore(saved: SavedWorkspace): Workspace {
	const pane = (tabs: string[]): Pane => ({ tabs, active: null });
	const ws: Workspace = {
		left: pane(saved.left),
		right: saved.right.length > 0 ? pane(saved.right) : null,
		focused: "left",
	};
	return settled(ws);
}
