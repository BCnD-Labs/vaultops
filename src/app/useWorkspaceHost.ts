import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { prepareSave } from "../core/note-format";
import type { Placement } from "../core/notes/block-move";
import {
	cloneBlock,
	extractBlock,
	insertBlock,
	placeOnCanvas,
} from "../core/notes/block-move";
import { inOrder } from "../core/notes/canvas-edit";
import { moveCanvasCard } from "../core/notes/canvas-position";
import type { DocumentRow } from "../core/notes/document-identity";
import { movedPath } from "../core/notes/folders";
import {
	copyBlock,
	type MoveReceipt,
	moveBlock,
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
import { readOnlyHost } from "../host/read-only-host";
import {
	type BlockWrite,
	createLiveDocuments,
	type LiveDocuments,
	type UndoResult,
} from "./live-documents";
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
	notes?: readonly DocumentRow[];
	/** Whether a path is a canvas; the app answers it from the vault's notes. */
	isCanvas: (path: string) => boolean;
	/** After any save, for the note list and history (tab paths are handled here). */
	onSaved: (info: SavedInfo) => void;
	onCanvasTitleSaved?: (from: string, to: string, title: string) => void;
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
	copy?: boolean;
	undo: () => Promise<UndoResult>;
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
	notes,
	isCanvas,
	onSaved,
	onCanvasTitleSaved,
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
	const canvasTitleSaved = useRef(onCanvasTitleSaved);
	canvasTitleSaved.current = onCanvasTitleSaved;
	const notesRef = useRef(notes);
	notesRef.current = notes;
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
	const [registry, setRegistry] = useState<LiveDocuments | null>(null);
	useLayoutEffect(() => {
		documents.current?.setWritable(writable);
		if (notes) documents.current?.setNotes(notes);
	}, [writable, notes]);
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
			{
				notes: notesRef.current ?? [],
				writable: latest.current.writable,
				onCanvasTitleSaved: (from, to, title) => {
					if (from !== to) change((ws) => renameDoc(ws, from, to));
					canvasTitleSaved.current?.(from, to, title);
				},
			},
			{
				open: (path, text) => openNote(nativeHost, path, text),
				onSaved: handleSaved,
			},
		);
		documents.current = registry;
		setRegistry(registry);
		for (const id of SLOTS) {
			loading.current[id] = null;
			sessions.current[id].clear();
		}
		return () => {
			documents.current = null;
			registry.dispose();
		};
	}, [nativeHost, vaultGeneration, handleSaved, change]);
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
				setRegistry(null);
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

	const dropBlock = async (
		to: string,
		blockId: string,
		from: string,
		placement: Placement,
		copy = false,
	): Promise<BlockMoveResult> => {
		const registry = documents.current;
		if (!writable)
			return {
				ok: false,
				message: "This vault is read-only, so the block was not moved.",
			};
		if (!registry)
			return {
				ok: false,
				message: "Open both documents before moving a block.",
			};
		const move: BlockWrite<MoveInfo | null> = async (
			source,
			target,
			publish,
		) => {
			const base = source.base;
			const block = base.blocks.find((block) => block.id === blockId);
			if (!block)
				throw new Error("This block is no longer in the source document.");
			if (block.type === "listItem")
				throw new Error("A list item moves only within its own editor.");
			if (
				"x" in placement
					? target.kind !== "canvas"
					: from === to && target.kind === "canvas"
			)
				throw new Error("This drop location is no longer available.");
			const { path, diskText } = source;
			const expected = { source: diskText, destination: target.diskText };
			if (from === to) {
				if (!copy && "after" in placement && placement.after === blockId)
					return null;
				let next = base;
				if ("x" in placement) {
					next = copy
						? placeOnCanvas(
								base,
								cloneBlock(base, blockId),
								placement.x,
								placement.y,
							)
						: {
								...base,
								blocks: moveCanvasCard(base.blocks, blockId, placement),
							};
				} else {
					const { doc, lines } = copy
						? { doc: base, lines: cloneBlock(base, blockId) }
						: extractBlock(base, blockId);
					next = insertBlock(doc, lines, placement.after, placement);
				}
				const saved = prepareSave(next);
				if (!saved.ok)
					throw new Error("The block did not pass the save check.");
				await inOrder(host, path, async () => {
					if ((await host.readText(path)) !== diskText)
						throw new Error(
							"The document changed on disk before the block could be moved.",
						);
					if (saved.text !== diskText)
						await host.writeTextAtomic(path, saved.text);
				});
				publish(saved.text, saved.text);
				return null;
			}
			const receipt = copy
				? {
						copy: true,
						source: path,
						destination: target.path,
						sourceBefore: diskText,
						sourceAfter: diskText,
						destinationBefore: target.diskText,
						destinationAfter: await copyBlock(
							host,
							path,
							target.path,
							blockId,
							placement,
							undefined,
							expected,
						),
						lost: { connectors: 0, groups: 0 },
						recoveryPath: null,
					}
				: await moveBlock(
						host,
						path,
						target.path,
						blockId,
						placement,
						undefined,
						expected,
					);
			publish(receipt.sourceAfter, receipt.destinationAfter);
			const undo = registry.recordMove(
				{ ...receipt, source: from, destination: to },
				setMoving,
			);
			return {
				destination: target.path,
				lost: receipt.lost,
				recoveryPath: receipt.recoveryPath,
				undo,
				copy,
			};
		};
		const failure = (reason: unknown) => ({
			ok: false as const,
			message: reason instanceof Error ? reason.message : String(reason),
		});
		try {
			const receipt = await registry.withSavedDocuments(
				from,
				to,
				move,
				setMoving,
			);
			return receipt ? { ok: true, moved: receipt } : { ok: true };
		} catch (reason) {
			return failure(reason);
		}
	};

	const blockToPath = (from: PaneId, blockId: string, destination: string) => {
		const registry = documents.current;
		const source = paneOf(from);
		return dropBlock(
			registry?.idAt(destination) ?? "",
			blockId,
			(source && registry?.idAt(source)) || "",
			{ after: null },
		);
	};

	const blockToNote = (
		from: PaneId,
		blockId: string,
	): Promise<BlockMoveResult> => {
		const path = paneOf(from === "left" ? "right" : "left");
		return path && !canvas(path)
			? blockToPath(from, blockId, path)
			: Promise.resolve({
					ok: false,
					message: "Open a note beside the canvas to move this block into.",
				});
	};

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
		documents: registry,
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
		/** Move a block between documents identified by their drag and drop surfaces. */
		dropBlock,
		undo: () => documents.current?.undo(setMoving),
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
