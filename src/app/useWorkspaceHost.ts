import { useCallback, useEffect, useRef, useState } from "react";
import { parseNote } from "../core/note-format";
import type { Placement } from "../core/notes/block-move";
import { moveBlock } from "../core/notes/move-block";
import {
	closeSplit,
	closeTab,
	emptyWorkspace,
	focusPane,
	moveTab,
	NEW_TAB,
	openDoc,
	openEmptyTab,
	type PaneId,
	pruneDocs,
	renameDoc,
	restore,
	type SavedWorkspace,
	selectTab,
	splitFrom,
	type Workspace,
} from "../core/workspace";
import { openNote } from "../editor/note-io";
import type { SavedInfo } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { type NoteSession, useNoteSession } from "./useNoteSession";

export type PaneKind = "note" | "canvas" | "empty" | "none";

/** What one pane shows, ready for a screen to render. */
export interface PaneView {
	id: PaneId;
	tabs: string[];
	active: string | null;
	kind: PaneKind;
	/**
	 * This pane's note session. It holds a note only when `kind` is "note" and
	 * `ready` is true; for every other kind it is idle.
	 */
	session: NoteSession;
	/** False while a note is still being read into the pane after a change. */
	ready: boolean;
}

export interface WorkspaceHostOptions {
	/** The vault host (it refuses writes when the vault is read-only). */
	host: Host;
	writable: boolean;
	/** Whether a path is a canvas; the app answers it from the vault's notes. */
	isCanvas: (path: string) => boolean;
	/** After any save, for the note list and history (tab paths are handled here). */
	onSaved: (info: SavedInfo) => void;
	/** A save was refused because a note is unsaved, so the command did not run. */
	onUnsaved: (message: string) => void;
	/** A note could not be read into its pane; its tab was closed. */
	onError: (message: string) => void;
}

export type WorkspaceHost = ReturnType<typeof useWorkspaceHost>;

/** How a block move ended; a refusal says why, in words for the person. */
export type BlockMoveResult = { ok: true } | { ok: false; message: string };

const SLOTS = ["left", "right"] as const;
const DIVIDER = "\n----------------\n\n";

/**
 * Owns the workspace (panes and tabs) and one live note session per pane, and
 * keeps them in step: a command first saves every open note, then changes the
 * workspace, then each pane reads the note it now shows. Nothing is dropped
 * unsaved, and a command that cannot save leaves everything as it was.
 *
 * Two panes only for now: a hook can't be called a variable number of times, so
 * each pane has a fixed session slot. A note that moves between panes is saved,
 * then read again in the other slot.
 */
export function useWorkspaceHost({
	host,
	writable,
	isCanvas,
	onSaved,
	onUnsaved,
	onError,
}: WorkspaceHostOptions) {
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	// The latest workspace, updated at once so commands in a row build on each other.
	const current = useRef(workspace);
	const change = useCallback((next: (ws: Workspace) => Workspace) => {
		current.current = next(current.current);
		setWorkspace(current.current);
	}, []);
	const latest = useRef({ isCanvas, onSaved, onError });
	latest.current = { isCanvas, onSaved, onError };
	const canvas = useCallback(
		(path: string) => latest.current.isCanvas(path),
		[],
	);

	// A save that renames a note carries its tab along.
	const handleSaved = useCallback(
		(info: SavedInfo) => {
			if (info.oldPath !== info.path)
				change((ws) => renameDoc(ws, info.oldPath, info.path));
			latest.current.onSaved(info);
		},
		[change],
	);
	const sessionOptions = { host, writable, onSaved: handleSaved, onUnsaved };
	const left = useNoteSession(sessionOptions);
	const right = useNoteSession(sessionOptions);
	const sessions = useRef({ left, right });
	sessions.current = { left, right };

	// Each pane reads the note it shows (and puts a note away when it shows
	// something else). `loading` stops a slow read from landing after the pane
	// has moved on.
	const loading = useRef<Record<PaneId, string | null>>({
		left: null,
		right: null,
	});
	useEffect(() => {
		for (const id of SLOTS) {
			const session = sessions.current[id];
			const active = (id === "left" ? workspace.left : workspace.right)?.active;
			const want =
				active && active !== NEW_TAB && !canvas(active) ? active : null;
			if (want === null) {
				loading.current[id] = null;
				if (session.opened || session.livePathRef.current !== null)
					session.clear();
				continue;
			}
			if (session.livePathRef.current === want || loading.current[id] === want)
				continue;
			loading.current[id] = want;
			openNote(host, want).then(
				(note) => {
					if (loading.current[id] !== want) return;
					loading.current[id] = null;
					sessions.current[id].load(note, want);
				},
				(reason) => {
					if (loading.current[id] !== want) return;
					loading.current[id] = null;
					change((ws) => closeTab(ws, want));
					latest.current.onError(
						reason instanceof Error ? reason.message : String(reason),
					);
				},
			);
		}
	}, [workspace, host, canvas, change]);

	/** Save every open note. False (after saying why) if any could not be saved. */
	const settleAll = useCallback(async () => {
		const results = await Promise.all(
			SLOTS.map((id) => sessions.current[id].settle()),
		);
		return results.every(Boolean);
	}, []);

	const paneOf = useCallback((id: PaneId) => {
		const pane = id === "left" ? current.current.left : current.current.right;
		return pane?.active && pane.active !== NEW_TAB ? pane.active : null;
	}, []);

	/** Read a pane's note again from disk, after a block move changed its file. */
	const reloadPane = useCallback(
		async (id: PaneId) => {
			const path = sessions.current[id].livePathRef.current;
			if (path === null) return;
			try {
				sessions.current[id].load(await openNote(host, path), path);
			} catch (reason) {
				latest.current.onError(
					reason instanceof Error ? reason.message : String(reason),
				);
			}
		},
		[host],
	);

	/** The document id a pane is showing (a note's is read from its session). */
	const documentId = useCallback(
		async (id: PaneId): Promise<string | null> => {
			const path = paneOf(id);
			if (path === null) return null;
			if (!canvas(path))
				return sessions.current[id].opened?.note?.header.noteId ?? null;
			try {
				return parseNote(await host.readText(path)).note?.header.noteId ?? null;
			} catch {
				return null;
			}
		},
		[host, canvas, paneOf],
	);

	/**
	 * Move a block between two shown documents: save every open note, move the
	 * block on disk (destination written first, so a failure leaves both copies),
	 * then read both documents again so the screen matches the disk. `find` runs
	 * after the save, because saving can rename a note and so change its path.
	 */
	const moveBetween = useCallback(
		async (
			find: () => Promise<{ from: PaneId; to: PaneId } | string>,
			blockId: string,
			placement: Placement,
		): Promise<BlockMoveResult> => {
			const refuse = (message: string): BlockMoveResult => ({
				ok: false,
				message,
			});
			if (!writable)
				return refuse("This vault is read-only, so the block was not moved.");
			if (!(await settleAll())) {
				const why = SLOTS.map((id) =>
					sessions.current[id].failureReason(),
				).find(Boolean);
				return refuse(
					`Save the note before moving a block: ${why ?? "the save did not finish"}.`,
				);
			}
			const found = await find();
			if (typeof found === "string") return refuse(found);
			const { from, to } = found;
			const source = paneOf(from);
			const destination = paneOf(to);
			if (source === null || destination === null)
				return refuse("Open both documents before moving a block.");
			for (const id of [from, to]) {
				const path = id === from ? source : destination;
				if (canvas(path)) continue;
				const opened = sessions.current[id].opened;
				if (!opened?.editable)
					return refuse(
						opened?.notice ??
							"This note is read-only, so the block was not moved.",
					);
			}
			let failure: string | null = null;
			try {
				await moveBlock(host, source, destination, blockId, placement);
			} catch (reason) {
				failure = reason instanceof Error ? reason.message : String(reason);
			}
			// Win or lose, show what is on disk now.
			await Promise.all([reloadPane(from), reloadPane(to)]);
			return failure === null ? { ok: true } : refuse(failure);
		},
		[host, writable, canvas, settleAll, paneOf, reloadPane],
	);

	/**
	 * A block was dropped on a pane. The drag carries only the id of the document
	 * it came from, so find which other pane is showing that one.
	 */
	const dropBlock = useCallback(
		(
			to: PaneId,
			blockId: string,
			sourceId: string,
			placement: Placement,
		): Promise<BlockMoveResult> =>
			moveBetween(
				async () => {
					if (paneOf(to) === null)
						return "Open a note or canvas to move the block into.";
					for (const from of SLOTS)
						if (from !== to && (await documentId(from)) === sourceId)
							return { from, to };
					return "Open the source note before moving this block.";
				},
				blockId,
				placement,
			),
		[moveBetween, paneOf, documentId],
	);

	/** A canvas card's "move to note": into the note shown beside the canvas. */
	const blockToNote = useCallback(
		(from: PaneId, blockId: string): Promise<BlockMoveResult> =>
			moveBetween(
				async () => {
					const to = from === "left" ? "right" : "left";
					const path = paneOf(to);
					return path !== null && !canvas(path)
						? { from, to }
						: "Open a note beside the canvas to move this block into.";
				},
				blockId,
				{ after: null },
			),
		[moveBetween, paneOf, canvas],
	);

	// Every command saves first, so closing or moving a tab never drops text.
	const run = useCallback(
		async (next: (ws: Workspace) => Workspace) => {
			if (!(await settleAll())) return false;
			change(next);
			return true;
		},
		[settleAll, change],
	);

	const restoreFrom = useCallback(
		(saved: SavedWorkspace) => {
			let next = restore(saved);
			for (const id of SLOTS) {
				const pane = id === "left" ? next.left : next.right;
				const first = pane?.tabs[0];
				if (first) next = selectTab(next, id, first, canvas);
			}
			change(() => focusPane(next, "left"));
		},
		[change, canvas],
	);

	const view = (id: PaneId): PaneView | null => {
		const pane = id === "left" ? workspace.left : workspace.right;
		if (!pane) return null;
		const active = pane.active;
		const kind: PaneKind =
			active === null
				? "none"
				: active === NEW_TAB
					? "empty"
					: canvas(active)
						? "canvas"
						: "note";
		const session = id === "left" ? left : right;
		return {
			id,
			tabs: pane.tabs,
			active,
			kind,
			session,
			ready:
				kind !== "note" ||
				(session.livePath === active && session.opened !== null),
		};
	};
	const panes = { left: view("left") as PaneView, right: view("right") };
	const focusedPane = panes[workspace.focused] ?? panes.left;

	return {
		workspace,
		panes,
		focused: workspace.focused,
		/** The focused pane's note session, for the Details panel, breadcrumb and status bar. */
		focusedSession:
			focusedPane.kind === "note" && focusedPane.ready
				? focusedPane.session
				: null,
		/** Show a document (in the focused pane unless one is named). */
		open: (path: string, pane?: PaneId) =>
			run((ws) => openDoc(ws, path, canvas, pane)),
		select: (pane: PaneId, path: string) =>
			run((ws) => selectTab(ws, pane, path, canvas)),
		/** Close a tab; name the pane for the empty tab, which each pane can have. */
		close: (path: string, pane?: PaneId) =>
			run((ws) => closeTab(ws, path, pane)),
		newTab: (pane?: PaneId) => run((ws) => openEmptyTab(ws, pane)),
		split: (path: string) => run((ws) => splitFrom(ws, path, canvas)),
		moveTab: (path: string, to: PaneId, index?: number) =>
			run((ws) => moveTab(ws, path, to, index, canvas)),
		closeSplit: () => run(closeSplit),
		/** Drop tabs whose document is gone (saves open notes first). */
		prune: (exists: (path: string) => boolean) =>
			run((ws) => pruneDocs(ws, exists)),
		focus: (pane: PaneId) => change((ws) => focusPane(ws, pane)),
		/** A canvas or note that was renamed or moved keeps its tab. */
		rename: (from: string, to: string) =>
			change((ws) => renameDoc(ws, from, to)),
		restoreFrom,
		settleAll,
		/** Move a block dropped on `to` from whichever pane shows document `sourceId`. */
		dropBlock,
		/** Move a block from the canvas in `from` into the note in the other pane. */
		blockToNote,
		/** Save every open note now (quit, window hidden). */
		flushAll: async () => {
			const results = await Promise.all(
				SLOTS.map((id) => sessions.current[id].flush()),
			);
			return results.every(Boolean);
		},
		/** Unsaved text of every open note, for the recovery file at quit. */
		recoveryTexts: (now: Date) =>
			SLOTS.map((id) => sessions.current[id].recoveryText(now)).filter(
				(text): text is string => text !== null,
			),
		/** `recoveryTexts` as one block, in the recovery file's format. */
		recoveryText: (now: Date) =>
			SLOTS.map((id) => sessions.current[id].recoveryText(now))
				.filter((text): text is string => text !== null)
				.join(DIVIDER),
	};
}
