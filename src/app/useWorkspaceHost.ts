import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { parseNote } from "../core/note-format";
import type { Placement } from "../core/notes/block-move";
import { movedPath } from "../core/notes/folders";
import {
	copyBlock,
	type MoveReceipt,
	moveBlock,
	undoMove,
} from "../core/notes/move-block";
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
import { READ_ONLY_VAULT_MESSAGE, readOnlyHost } from "../host/read-only-host";
import { createLiveDocuments, type LiveDocuments } from "./live-documents";
import {
	type NoteSession,
	UNSAVED_NOTE_MESSAGE,
	useNoteSession,
} from "./useNoteSession";

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
	/** The host for the current vault. */
	host: Host;
	writable: boolean;
	vaultGeneration?: number;
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

/** What a finished move offers: where the block went, what it cost, how to undo it. */
export interface MoveInfo {
	destination: string;
	lost: MoveReceipt["lost"];
	recoveryPath: string | null;
	undo: () => Promise<{ ok: true } | { ok: false; message: string }>;
}

/** How a block move ended; a refusal says why, in words for the person. */
export type BlockMoveResult =
	| { ok: true; moved?: MoveInfo }
	| { ok: false; message: string };

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
	host: nativeHost,
	writable,
	vaultGeneration,
	isCanvas,
	onSaved,
	onUnsaved,
	onError,
}: WorkspaceHostOptions) {
	const host = useMemo(
		() => (writable ? nativeHost : readOnlyHost(nativeHost)),
		[nativeHost, writable],
	);
	const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
	// True while a block is being moved on disk. The notes cannot be typed in
	// meanwhile: text typed then would be gone when they are read again.
	const [moving, setMoving] = useState(false);
	// The latest workspace, updated at once so commands in a row build on each other.
	const current = useRef(workspace);
	const change = useCallback((next: (ws: Workspace) => Workspace) => {
		current.current = next(current.current);
		setWorkspace(current.current);
	}, []);
	const latest = useRef({ isCanvas, onSaved, onError, onUnsaved, writable });
	latest.current = { isCanvas, onSaved, onError, onUnsaved, writable };
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
	const documents = useRef<LiveDocuments | null>(null);
	useLayoutEffect(() => {
		documents.current?.setWritable(writable);
	}, [writable]);
	const sessionOptions = {
		host,
		writable,
		documents: () => documents.current,
		onUnsaved,
	};
	const left = useNoteSession(sessionOptions);
	const right = useNoteSession(sessionOptions);
	const sessions = useRef({ left, right });
	sessions.current = { left, right };

	// Each pane reads the note it shows (and puts a note away when it shows
	// something else). `loading` stops a slow read from landing after the pane
	// has moved on.
	type Load = { path: string; unsubscribe(): void };
	const loading = useRef<Record<PaneId, Load | null>>({
		left: null,
		right: null,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: Each selected vault gets its own registry.
	useEffect(() => {
		const registry = createLiveDocuments(
			nativeHost,
			{ notes: [], writable: latest.current.writable },
			{
				open: (path) => openNote(nativeHost, path),
				onSaved: handleSaved,
			},
		);
		documents.current = registry;
		for (const id of SLOTS) {
			loading.current[id] = null;
			sessions.current[id].clear();
		}
		return () => {
			documents.current = null;
			registry.dispose();
		};
	}, [nativeHost, vaultGeneration, handleSaved]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: Reattach after replacing the registry.
	useEffect(() => {
		for (const id of SLOTS) {
			const session = sessions.current[id];
			const active = (id === "left" ? workspace.left : workspace.right)?.active;
			const want =
				active && active !== NEW_TAB && !canvas(active) ? active : null;
			if (want !== null && loading.current[id]?.path === want) continue;
			loading.current[id]?.unsubscribe();
			loading.current[id] = null;
			if (want === null) {
				session.clear();
				continue;
			}
			if (session.livePathRef.current === want) continue;
			const subscription = session.subscribe(want);
			if (!subscription) continue;
			const load = { path: want, unsubscribe: subscription.unsubscribe };
			loading.current[id] = load;
			subscription.ready.then(
				(note) => {
					if (loading.current[id] !== load) return;
					loading.current[id] = null;
					if (note?.opened)
						sessions.current[id].load(note.opened, note.path, subscription);
				},
				(reason) => {
					if (loading.current[id] !== load) return;
					loading.current[id] = null;
					change((ws) => closeTab(ws, want));
					latest.current.onError(
						reason instanceof Error ? reason.message : String(reason),
					);
				},
			);
		}
	}, [workspace, nativeHost, vaultGeneration, canvas, change]);

	const settlePanes = useCallback(async () => {
		const results = await Promise.all(
			SLOTS.map((id) => sessions.current[id].settle()),
		);
		return results.every(Boolean);
	}, []);

	const flushAll = useCallback(
		() => documents.current?.flushAll() ?? Promise.resolve(true),
		[],
	);
	useEffect(() => {
		const onBlur = () => void flushAll();
		const onVisibility = () => {
			if (document.visibilityState === "hidden") onBlur();
		};
		window.addEventListener("blur", onBlur);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("blur", onBlur);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [flushAll]);

	/** Save all drafts. False (after saying why) if any could not be saved. */
	const settleAll = useCallback(async () => {
		if (await flushAll()) return true;
		latest.current.onUnsaved(UNSAVED_NOTE_MESSAGE);
		return false;
	}, [flushAll]);

	const chooseVault = async (pick: Host["chooseVault"]) => {
		const registry = documents.current;
		if (!registry || !(await settleAll())) return false;
		return registry.run(async () => {
			if (documents.current !== registry) return false;
			if (registry.hasDrafts()) {
				latest.current.onUnsaved(UNSAVED_NOTE_MESSAGE);
				return false;
			}
			// The native picker changes the host's vault before it returns.
			registry.setWritable(false);
			try {
				if ((await pick()) === null) return false;
				documents.current = null;
				registry.dispose();
				return true;
			} finally {
				registry.setWritable(latest.current.writable);
			}
		});
	};

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
				await sessions.current[id].reload(host, path);
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

	const moveLocked = useCallback(
		async (
			find: () => Promise<
				| { from: PaneId | { path: string }; to: PaneId | { path: string } }
				| string
			>,
			blockId: string,
			placement: Placement,
			refuse: (message: string) => BlockMoveResult,
			copy = false,
		): Promise<BlockMoveResult> => {
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
			const { from } = found;
			// The source and destination are panes that show them, or open files in the vault.
			const target = found.to;
			const fromPane = typeof from === "string" ? from : null;
			const to = typeof target === "string" ? target : null;
			const source = typeof from === "string" ? paneOf(from) : from.path;
			const destination =
				typeof target === "string" ? paneOf(target) : target.path;
			if (source === null || destination === null)
				return refuse("Open both documents before moving a block.");
			for (const id of [fromPane, to].filter(
				(pane): pane is PaneId => pane !== null,
			)) {
				const path = id === fromPane ? source : destination;
				if (canvas(path)) continue;
				const opened = sessions.current[id].opened;
				if (!opened?.editable)
					return refuse(
						opened?.notice ??
							"This note is read-only, so the block was not moved.",
					);
			}
			const reloadBoth = async () => {
				await Promise.all([
					...(copy || fromPane === null ? [] : [reloadPane(fromPane)]),
					...(to === null ? [] : [reloadPane(to)]),
				]);
			};
			let failure: string | null = null;
			let receipt: MoveReceipt | null = null;
			try {
				receipt = copy
					? (await copyBlock(host, source, destination, blockId, placement),
						null)
					: await moveBlock(host, source, destination, blockId, placement);
			} catch (reason) {
				failure = reason instanceof Error ? reason.message : String(reason);
			}
			// Win or lose, show what is on disk now.
			await reloadBoth();
			if (failure !== null)
				return refuse(failure ?? "The block was not moved.");
			if (copy) return { ok: true };
			if (receipt === null) return refuse("The block was not moved.");
			const made = receipt;
			return {
				ok: true,
				moved: {
					destination,
					lost: made.lost,
					recoveryPath: made.recoveryPath,
					undo: async () => {
						setMoving(true);
						try {
							if (!(await settleAll()))
								return {
									ok: false as const,
									message: "Save the open notes before undoing the move.",
								};
							if (!latest.current.writable)
								return { ok: false as const, message: READ_ONLY_VAULT_MESSAGE };
							try {
								await undoMove(host, made);
							} catch (reason) {
								await reloadBoth();
								return {
									ok: false as const,
									message:
										reason instanceof Error ? reason.message : String(reason),
								};
							}
							await reloadBoth();
							return { ok: true as const };
						} finally {
							setMoving(false);
						}
					},
				},
			};
		},
		[host, canvas, settleAll, paneOf, reloadPane],
	);

	/**
	 * Move a block between two shown documents: save every open note, move the
	 * block on disk (destination written first, so a failure leaves both copies),
	 * then read both documents again so the screen matches the disk. `find` runs
	 * after the save, because saving can rename a note and so change its path.
	 */
	const moveBetween = useCallback(
		async (
			find: () => Promise<
				| { from: PaneId | { path: string }; to: PaneId | { path: string } }
				| string
			>,
			blockId: string,
			placement: Placement,
			copy = false,
		): Promise<BlockMoveResult> => {
			const refuse = (message: string): BlockMoveResult => ({
				ok: false,
				message,
			});
			if (!writable)
				return refuse("This vault is read-only, so the block was not moved.");
			setMoving(true);
			try {
				return await moveLocked(find, blockId, placement, refuse, copy);
			} finally {
				setMoving(false);
			}
		},
		[writable, moveLocked],
	);

	/**
	 * A block was dropped on a pane. The drag carries only the id of the document
	 * it came from, so find which other pane or open tab is that one.
	 */
	const dropBlock = useCallback(
		(
			to: PaneId,
			blockId: string,
			sourceId: string,
			placement: Placement,
			copy = false,
		): Promise<BlockMoveResult> =>
			moveBetween(
				async () => {
					if (paneOf(to) === null)
						return "Open a note or canvas to move the block into.";
					for (const from of SLOTS)
						if (from !== to && (await documentId(from)) === sourceId)
							return { from, to };
					for (const path of [
						...current.current.left.tabs,
						...(current.current.right?.tabs ?? []),
					])
						if (
							path !== NEW_TAB &&
							path !== paneOf(to) &&
							(await host.readText(path).then(
								(t) => parseNote(t).note?.header.noteId,
								() => null,
							)) === sourceId
						)
							return { from: { path }, to };
					return "Open the source note before moving this block.";
				},
				blockId,
				placement,
				copy,
			),
		[host, moveBetween, paneOf, documentId],
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

	/**
	 * A canvas card's "Move to…": into any note or canvas in the vault, shown or
	 * not. A card landing on a canvas is placed beside the cards already there.
	 */
	const blockToPath = useCallback(
		(
			from: PaneId,
			blockId: string,
			destination: string,
		): Promise<BlockMoveResult> => {
			const other = from === "left" ? "right" : "left";
			return moveBetween(
				async () => ({
					from,
					to: paneOf(other) === destination ? other : { path: destination },
				}),
				blockId,
				{ after: null },
			);
		},
		[moveBetween, paneOf],
	);

	// Tab commands still save the panes first. A detached draft can be reopened
	// to retry, discard it, or save a copy.
	const run = useCallback(
		async (next: (ws: Workspace) => Workspace) => {
			if (!(await settlePanes())) return false;
			change(next);
			return true;
		},
		[settlePanes, change],
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
	const recoveryTexts = (now: Date) =>
		documents.current?.recoveryTexts(now) ?? [];
	const rename = (from: string, to: string) =>
		change((ws) => renameDoc(ws, from, to));

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
		rename,
		rekey(from: string, to: string) {
			documents.current?.rekey(from, to);
			change((ws) =>
				[...ws.left.tabs, ...(ws.right?.tabs ?? [])].reduce(
					(next, path) => renameDoc(next, path, movedPath(path, from, to)),
					ws,
				),
			);
		},
		withDocuments<T>(
			task: (registry: LiveDocuments, host: Host) => Promise<T>,
		) {
			const registry = documents.current;
			return registry?.run(async () => {
				if (documents.current === registry) return task(registry, host);
			});
		},
		renameDraft: (path: string, title: string) =>
			documents.current?.renameDraft(path, title),
		restoreFrom,
		chooseVault,
		settleAll,
		/** True while a block is being moved; notes are not editable then. */
		moving,
		/** Move a block dropped on `to` from whichever pane shows document `sourceId`. */
		dropBlock,
		/** Move a block from the canvas in `from` into the note in the other pane. */
		blockToNote,
		blockToPath,
		flushAll,
		/** Unsaved text for the recovery file at quit. */
		recoveryTexts,
		/** `recoveryTexts` as one block, in the recovery file's format. */
		recoveryText: (now: Date) => recoveryTexts(now).join(DIVIDER),
	};
}
