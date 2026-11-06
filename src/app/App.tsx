import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Placement } from "../core/notes/block-move";
import {
	createFolder,
	movedPath,
	moveFolder,
	renameFolder,
	within,
} from "../core/notes/folders";
import { moveNote } from "../core/notes/rename";
import {
	deleteForever,
	listTrash,
	restoreNote,
	type TrashedNote,
	trashFolder,
	trashNote,
} from "../core/notes/trash";
import { buildTree } from "../core/notes/tree";
import { parseMaintainer } from "../core/session/maintainer";
import { joinRecovery } from "../core/session/recovery";
import { NEW_TAB, type PaneId } from "../core/workspace";
import { DebugPanel } from "../debug/DebugPanel";
import { getLogger } from "../debug/index";
import { MaintainerPanel } from "../debug/MaintainerPanel";
import { openNote } from "../editor/note-io";
import { createQuitGuard } from "../editor/quit";
import { saveAsCopy } from "../editor/save-draft";
import type { SavedInfo } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { readOnlyHost } from "../host/read-only-host";
import { AppearanceProvider } from "./AppearanceContext";
import { AppShell } from "./AppShell";
import { CanvasPane } from "./CanvasPane";
import { lastCanvas } from "./canvas-layout";
import { browserLastNote, pickInitialNote } from "./last-note";
import { NewTab } from "./NewTab";
import { NoteTools } from "./NoteTools";
import type { TreeActions } from "./NoteTree";
import { SessionNoteView } from "./NoteView";
import {
	canGoBack,
	canGoForward,
	EMPTY_NAV,
	type NavHistory,
	pruneEntries,
	renameEntry,
	step,
	visit,
} from "./nav-history";
import { ScreenPane } from "./ScreenPane";
import { Sidebar } from "./Sidebar";
import {
	chooseAndLoad,
	compareRows,
	createAndLoad,
	createCanvasAndLoad,
	loadVault,
	type VaultView,
} from "./session";
import { type Selection, selectionForPath } from "./sidebar-selection";
import { browserTabs, pruneTabs } from "./tabs";
import { type PaneView, useWorkspaceHost } from "./useWorkspaceHost";
import { WorkspacePanes } from "./WorkspacePanes";
import "../ui/theme.css";
import "./app.css";

const other = (id: PaneId): PaneId => (id === "left" ? "right" : "left");

export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [reading, setReading] = useState(false);
	const [screen, setScreen] = useState<
		"note" | "trash" | "health" | "settings"
	>("note");
	const [trash, setTrash] = useState<TrashedNote[]>([]);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	const [screenNotice, setScreenNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// The canvas to reopen when a vault opens with no note to show.
	const [canvasPath, setCanvasPath] = useState<string | null>(null);
	const [focusCanvas, setFocusCanvas] = useState(false);
	// A canvas reads its file again when this changes (after a block left it).
	const [canvasKey, setCanvasKey] = useState(0);
	// Opening a vault may create it, so loading and choosing a vault use `host`.
	// Everything that changes notes and folders goes through `vaultHost`, which
	// refuses every write unless the vault is writable. Even a missed check in a
	// screen cannot change a read-only vault.
	const writable = view?.writable === true;
	const vaultHost = useMemo(
		() => (writable ? host : readOnlyHost(host)),
		[host, writable],
	);
	const tabStore = useRef(browserTabs());
	// Back and forward through opened notes; tied to one vault.
	const [navState, setNavState] = useState<{
		vault: string | null;
		history: NavHistory;
	}>({ vault: null, history: EMPTY_NAV });
	const tree = useMemo(
		() => (view ? buildTree(view.folders, view.notes) : []),
		[view],
	);
	// Each pane's note has its own title box.
	const leftTitle = useRef<HTMLInputElement>(null);
	const rightTitle = useRef<HTMLInputElement>(null);
	const titleInputs = { left: leftTitle, right: rightTitle };
	const focusTitle = useRef(false);
	const lastNotes = useRef(browserLastNote());
	const autoOpened = useRef(false);
	const [showDebug, setShowDebug] = useState(false);
	const [maintainer, setMaintainer] = useState(false);
	const maintainerRef = useRef(false);
	const [showMaintainer, setShowMaintainer] = useState(false);
	const [appInfo, setAppInfo] = useState({ name: "vaultops", version: "?" });
	const [treeNotice, setTreeNotice] = useState<string | null>(null);
	const [selection, setSelection] = useState<Selection>({ kind: "all" });
	const vaultName = view?.name ?? null;
	// The latest view, updated at once so a command that follows a change (make a
	// note, then open it) already sees the new rows.
	const viewRef = useRef(view);
	viewRef.current = view;
	const changeView = useCallback(
		(next: VaultView | null | ((v: VaultView | null) => VaultView | null)) => {
			const value = typeof next === "function" ? next(viewRef.current) : next;
			viewRef.current = value;
			setView(value);
		},
		[],
	);
	const isCanvas = useCallback(
		(path: string) =>
			viewRef.current?.notes.some(
				(row) => row.path === path && row.kind === "canvas",
			) ?? false,
		[],
	);
	const nav = navState.vault === vaultName ? navState.history : EMPTY_NAV;
	useEffect(() => {
		setNavState({ vault: vaultName, history: EMPTY_NAV });
	}, [vaultName]);
	useEffect(() => {
		if (!view?.name) {
			setCanvasPath(null);
			return;
		}
		const saved = lastCanvas(view.name);
		setCanvasPath(saved);
	}, [view?.name]);
	const selectCanvas = useCallback(
		(path: string | null) => {
			setCanvasPath(path);
			if (path && vaultName) lastCanvas(vaultName, path);
		},
		[vaultName],
	);

	// A save that renamed a note: the workspace carries the tab (inside the
	// host); history and the note list follow here.
	const onSaved = useCallback(
		(info: SavedInfo) => {
			if (info.oldPath !== info.path)
				setNavState((state) => ({
					...state,
					history: renameEntry(state.history, info.oldPath, info.path),
				}));
			changeView((v) => {
				const row = v?.notes.find((n) => n.path === info.oldPath);
				if (!v || !row) return v;
				const sameTags = row.tags.join("\n") === info.tags.join("\n");
				const repaired = v.report.some(
					(e) => e.path === info.oldPath && e.group === "truncated",
				);
				if (
					!info.titleChanged &&
					sameTags &&
					row.preview === info.preview &&
					!repaired
				)
					return v;
				return {
					...v,
					report: v.report.map((e) =>
						e.path === info.oldPath
							? {
									...e,
									path: info.path,
									...(repaired
										? {
												group: "good" as const,
												reason: "The note was read without problems.",
											}
										: {}),
								}
							: e,
					),
					notes: v.notes
						.map((n) =>
							n.path === info.oldPath
								? {
										...n,
										path: info.path,
										title: info.title,
										tags: info.tags,
										preview: info.preview,
									}
								: n,
						)
						.sort(compareRows),
				};
			});
		},
		[changeView],
	);

	// The workspace: the tabs of each pane and one live note per pane (text,
	// title, properties, autosave and recovery). Every command saves all open
	// notes first; if a save fails, nothing changes and nothing typed is lost.
	const ws = useWorkspaceHost({
		host: vaultHost,
		writable,
		isCanvas,
		onSaved,
		onUnsaved: setError,
		onError: setError,
	});
	const wsRef = useRef(ws);
	wsRef.current = ws;
	const { left, right } = ws.panes;
	const focusedPane = ws.panes[ws.focused] ?? left;
	// The focused pane's note, for the tools, status bar and breadcrumb.
	const session = ws.focusedSession;
	const anyShown = [left, right].some(
		(pane) => pane && (pane.kind === "note" || pane.kind === "canvas"),
	);

	// Bring back this vault's tabs (for notes that still exist) when it opens.
	useEffect(() => {
		if (!vaultName) return;
		const notes = viewRef.current?.notes ?? [];
		wsRef.current.restoreFrom({
			left: pruneTabs(
				tabStore.current.get(vaultName),
				notes.map((n) => n.path),
			),
			right: [],
		});
	}, [vaultName]);
	// Remember the tabs. Runs when the workspace changes (a vault change makes a
	// new workspace first), so one vault's tabs are never saved under another.
	const workspace = ws.workspace;
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!vaultName) return;
		tabStore.current.set(
			vaultName,
			[...workspace.left.tabs, ...(workspace.right?.tabs ?? [])].filter(
				(tab) => tab !== NEW_TAB,
			),
		);
	}, [workspace]);
	useEffect(() => {
		// A note or canvas that was trashed, deleted or moved loses its tab.
		if (!view) return;
		const all = new Set(view.notes.map((n) => n.path));
		const existing = view.notes
			.filter((n) => n.kind !== "canvas")
			.map((n) => n.path);
		const shown = wsRef.current.workspace;
		if (
			[shown.left, shown.right].some((pane) =>
				pane?.tabs.some((tab) => tab !== NEW_TAB && !all.has(tab)),
			)
		)
			void wsRef.current.prune((path) => all.has(path));
		setNavState((state) => {
			const history = pruneEntries(state.history, existing);
			return history === state.history ? state : { ...state, history };
		});
	}, [view]);

	const open = useCallback(
		async (
			path: string,
			options: { follow?: boolean; record?: boolean; pane?: PaneId } = {},
		) => {
			const { follow = true, record = true, pane } = options;
			setError(null);
			if (!(await wsRef.current.open(path, pane))) return false;
			setScreen("note");
			if (isCanvas(path)) selectCanvas(path);
			else {
				if (record)
					setNavState((state) => ({
						...state,
						history: visit(state.history, path),
					}));
				if (follow) setSelection(selectionForPath(path));
				if (vaultName) lastNotes.current.set(vaultName, path);
			}
			return true;
		},
		[isCanvas, selectCanvas, vaultName],
	);

	// Put a pane's note back on screen from the disk (after "load the disk
	// version", or a repair).
	const reloadPane = useCallback(
		async (pane: PaneView) => {
			const path = pane.session.livePathRef.current;
			if (path === null) return;
			try {
				pane.session.load(await openNote(host, path), path);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (
				(event.metaKey || event.ctrlKey) &&
				event.shiftKey &&
				event.key.toLowerCase() === "d"
			) {
				event.preventDefault();
				if (maintainerRef.current) setShowDebug((v) => !v);
				return;
			}
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				void wsRef.current.flushAll();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Saving on quit: the window waits for every open note to save, and stays
	// open if any save fails.
	useEffect(() => {
		let remove: (() => void) | undefined;
		let gone = false;
		host
			.onCloseRequested(
				createQuitGuard(
					() => wsRef.current.flushAll(),
					// Closing with edits that could not be saved: keep their text.
					async () => {
						const fresh = wsRef.current.recoveryText(new Date());
						if (!fresh) return true;
						try {
							// Earlier copies stay: closing twice must not replace the first.
							// Only a missing file means "no earlier copy"; any other read
							// error stops the close instead of overwriting that copy.
							const older = await host.readAppFile("unsaved-recovery.txt");
							await host.writeAppFile(
								"unsaved-recovery.txt",
								joinRecovery(fresh, older),
							);
						} catch {
							setError(
								"Could not keep a copy of the unsaved text. Copy it out of the note before closing.",
							);
							return false;
						}
						return true;
					},
				),
			)
			.then((off) => {
				if (gone) off();
				else remove = off;
			})
			.catch(() =>
				setError("Saving on quit is unavailable. Save before closing."),
			);
		return () => {
			gone = true;
			remove?.();
		};
	}, [host]);

	const run = useCallback(
		async (task: () => Promise<VaultView | null>) => {
			setBusy(true);
			setError(null);
			try {
				const next = await task();
				if (next) {
					autoOpened.current = false;
					changeView(next);
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setBusy(false);
			}
		},
		[changeView],
	);

	// The maintainer switch: a small file on the maintainer's own computer.
	useEffect(() => {
		host
			.readAppFile("maintainer.json")
			.then((text) => {
				const on = parseMaintainer(text);
				maintainerRef.current = on;
				setMaintainer(on);
			})
			.catch(() => {});
	}, [host]);

	useEffect(() => {
		host
			.appInfo()
			.then(setAppInfo)
			.catch(() => {});
	}, [host]);

	useEffect(() => {
		run(() => loadVault(host));
	}, [host, run]);

	// After a vault loads: reopen the note that was open last (or the first one).
	useEffect(() => {
		if (
			!view ||
			screen !== "note" ||
			autoOpened.current ||
			anyShown ||
			view.status === "none"
		)
			return;
		autoOpened.current = true;
		const paths = view.notes
			.filter((n) => n.kind !== "canvas")
			.map((n) => n.path);
		const pick = pickInitialNote(
			paths,
			view.name ? lastNotes.current.get(view.name) : null,
		);
		const rememberedCanvas =
			canvasPath ?? (view.name ? lastCanvas(view.name) : null);
		if (pick) void open(pick);
		else {
			// No note to reopen: reopen the last canvas (or the first) as a tab.
			const canvas =
				view.notes.find(
					(row) => row.path === rememberedCanvas && row.kind === "canvas",
				) ?? view.notes.find((row) => row.kind === "canvas");
			if (canvas) void open(canvas.path);
		}
	}, [view, anyShown, open, screen, canvasPath]);

	useEffect(() => {
		if (session?.opened && focusTitle.current) {
			focusTitle.current = false;
			titleInputs[ws.focused].current?.focus();
			titleInputs[ws.focused].current?.select();
		}
	});

	const navigate = async (next: "trash" | "health" | "settings" | "note") => {
		if (!(await ws.settleAll())) return;
		setBusy(true);
		try {
			if (next === "trash") setTrash(await listTrash(host));
			if (next === "health") changeView(await loadVault(host));
			if (
				next === "note" &&
				focusedPane.kind === "note" &&
				view?.report.some(
					(e) => e.path === focusedPane.session.livePathRef.current,
				)
			)
				await reloadPane(focusedPane);
			else autoOpened.current = true;
			setConfirmDelete(null);
			setScreenNotice(null);
			setScreen(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const changeTrash = async (path: string, restore: boolean) => {
		if (!writable || busy || (!restore && confirmDelete !== path)) return;
		setBusy(true);
		try {
			let message = "Note deleted forever.";
			if (restore)
				message = `Restored to ${(await restoreNote(vaultHost, path)).path}.`;
			else await deleteForever(vaultHost, path);
			const entries = await listTrash(host);
			const next = await loadVault(host);
			setTrash(entries);
			changeView(next);
			setConfirmDelete(null);
			setScreenNotice(message);
		} catch (e) {
			setScreenNotice(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	// "New note" and "new canvas" open in the pane they were asked from (the
	// focused pane, from the sidebar), taking over that pane's empty tab.
	const startNote = async (
		folder = "",
		noteTitle = "Untitled",
		pane?: PaneId,
	) => {
		if (!view || !(await ws.settleAll())) return;
		setBusy(true);
		try {
			const made = await createAndLoad(vaultHost, view, folder, noteTitle);
			changeView(made.view);
			if (made.path) {
				focusTitle.current = noteTitle === "Untitled";
				await open(made.path, { pane });
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const startCanvas = async (folder = "", pane?: PaneId) => {
		if (!view || !(await ws.settleAll())) return;
		setBusy(true);
		try {
			const made = await createCanvasAndLoad(vaultHost, view, folder);
			changeView(made.view);
			if (made.path) {
				await open(made.path, { pane });
				setFocusCanvas(true);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	// Back and forward reopen the previous or next note in the history without
	// adding to it. Open notes are saved first, as with any other navigation.
	const goThrough = async (direction: -1 | 1) => {
		const moved = step(nav, direction);
		if (!moved) return;
		if (!(await ws.settleAll())) return;
		setNavState((state) => ({ ...state, history: moved.history }));
		await open(moved.path, { record: false });
	};

	// Moves a pane's note to the vault's trash (nothing is erased).
	const moveToTrash = async (pane: PaneView) => {
		const opened = pane.session.opened;
		if (!opened || !view) return;
		if (!(await ws.settleAll())) return;
		// Read after the save: a title change may just have renamed the file.
		const path = pane.session.livePathRef.current ?? opened.path;
		setBusy(true);
		try {
			await trashNote(vaultHost, path);
			const next = await loadVault(host);
			autoOpened.current = false;
			changeView(next);
			const exists = new Set(next.notes.map((n) => n.path));
			await ws.prune((p) => exists.has(p));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	// The documents being shown, by the path they are saved at right now.
	const shownPaths = () =>
		[left, right].flatMap((pane) => {
			if (!pane) return [];
			const path =
				pane.kind === "note"
					? (pane.session.livePathRef.current ?? pane.active)
					: pane.kind === "canvas"
						? pane.active
						: null;
			return path ? [path] : [];
		});

	// A folder action from the tree (make, rename, move, trash). Open notes are
	// saved first. A shown document the change touches follows its file to the
	// new path, or loses its tab when it went to the trash.
	const changeTree = async (
		affected: string | null,
		task: () => Promise<{ notice?: string; follow?: (path: string) => string }>,
	) => {
		if (!view || !(await ws.settleAll())) return;
		setTreeNotice(null);
		const touched = shownPaths().filter(
			(path) => affected !== null && within(path, affected),
		);
		setBusy(true);
		try {
			const done = await task();
			if (done.notice) setTreeNotice(done.notice);
			const next = await loadVault(host);
			changeView(next);
			for (const path of touched) {
				const target = done.follow ? done.follow(path) : null;
				if (target && target !== path) ws.rename(path, target);
			}
			if (touched.length > 0) autoOpened.current = false;
			const exists = new Set(next.notes.map((n) => n.path));
			await ws.prune((p) => exists.has(p));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const treeActions: TreeActions = {
		createFolder: (parent, name) =>
			void changeTree(null, async () => ({
				notice: (await createFolder(vaultHost, parent, name)).notice,
			})),
		renameFolder: (path, name) =>
			void changeTree(path, async () => {
				const r = await renameFolder(vaultHost, path, name);
				return {
					notice: r.notice,
					follow: (p) => movedPath(p, path, r.path),
				};
			}),
		deleteFolder: (path) =>
			void changeTree(path, async () => {
				await trashFolder(vaultHost, path);
				return {};
			}),
		deleteNote: (path) =>
			void changeTree(path, async () => {
				await trashNote(vaultHost, path);
				return {};
			}),
		move: (item, into) =>
			void changeTree(item.path, async () => {
				if (item.kind === "folder") {
					const r = await moveFolder(vaultHost, item.path, into);
					return {
						notice: r.notice,
						follow: (p) => movedPath(p, item.path, r.path),
					};
				}
				const r = await moveNote(vaultHost, item.path, into, {
					readOnly: item.readOnly,
				});
				return { notice: r.notice, follow: () => r.path };
			}),
	};

	// A note changed on disk while it was open: take the disk version...
	const loadDisk = async (pane: PaneView) => {
		pane.session.discard();
		await reloadPane(pane);
	};

	// ...or keep my edits as a separate note, leaving the file alone.
	const saveCopy = async (pane: PaneView) => {
		const { session: pane_session } = pane;
		const opened = pane_session.opened;
		const draft = pane_session.peek();
		if (!opened || !draft) return;
		const path = pane_session.livePathRef.current ?? opened.path;
		const result = await saveAsCopy(vaultHost, { ...opened, path }, draft);
		if (!result.ok) {
			setError(`The copy was not saved: ${result.message}`);
			return;
		}
		pane_session.discard();
		changeView(await loadVault(host));
		await open(result.path, { pane: pane.id });
	};

	// A block dropped in a pane (or sent from a canvas card): the host saves
	// everything, moves it on disk and reloads both documents. A refusal is
	// shown as the error line.
	const dropBlock = async (
		pane: PaneView,
		blockId: string,
		sourceId: string,
		placement: Placement,
	) => {
		const result = await wsRef.current.dropBlock(
			pane.id,
			blockId,
			sourceId,
			placement,
		);
		if (!result.ok) throw new Error(result.message);
	};

	const renderNote = (pane: PaneView) => (
		<SessionNoteView
			session={pane.session}
			writable={writable}
			reading={reading}
			busy={busy}
			titleInput={titleInputs[pane.id]}
			onLoadDisk={() => void loadDisk(pane)}
			onSaveCopy={() => void saveCopy(pane)}
			onMoveToTrash={() => void moveToTrash(pane)}
			onDropBlock={async (blockId, sourceId, slot) => {
				try {
					await dropBlock(pane, blockId, sourceId, slot);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				}
				// The block may have left a canvas, whatever came of the move.
				setCanvasKey((count) => count + 1);
			}}
		/>
	);

	const renderCanvas = (path: string, pane: PaneView) => {
		const beside = ws.panes[other(pane.id)];
		const noteBeside =
			beside?.kind === "note" &&
			beside.ready &&
			beside.session.opened?.editable === true &&
			writable;
		return (
			<CanvasPane
				key={canvasKey}
				host={vaultHost}
				path={path}
				canvases={(view?.notes ?? []).filter((row) => row.kind === "canvas")}
				writable={writable}
				focusName={focusCanvas}
				onFocusedName={() => setFocusCanvas(false)}
				onSelect={(next) => void open(next, { pane: pane.id })}
				onRename={(oldPath, newPath, nextTitle) => {
					selectCanvas(newPath);
					ws.rename(oldPath, newPath);
					changeView((v) =>
						v
							? {
									...v,
									report: v.report.map((e) =>
										e.path === oldPath ? { ...e, path: newPath } : e,
									),
									notes: v.notes
										.map((n) =>
											n.path === oldPath
												? { ...n, path: newPath, title: nextTitle }
												: n,
										)
										.sort(compareRows),
								}
							: v,
					);
				}}
				onNew={() => void startCanvas("", pane.id)}
				onClose={() => void ws.close(path, pane.id)}
				onDropBlock={async (blockId, noteId, position) => {
					await dropBlock(pane, blockId, noteId, position);
					// Show the new card. A refused move throws first, and the canvas
					// reloads itself and says why.
					setCanvasKey((count) => count + 1);
				}}
				onMoveToNote={
					noteBeside
						? async (blockId) => {
								const result = await wsRef.current.blockToNote(
									pane.id,
									blockId,
								);
								if (!result.ok) throw new Error(result.message);
								setCanvasKey((count) => count + 1);
							}
						: undefined
				}
			/>
		);
	};

	// The empty tab, or a pane with no tab: the ways to start. A canvas is not
	// offered while another pane already shows one (two never show together).
	const renderEmpty = (pane: PaneView) => {
		const canvasShown = [left, right].some(
			(p) => p && p.id !== pane.id && p.kind === "canvas",
		);
		const folder = selection.kind === "folder" ? selection.value : "";
		return (
			<main className="pane">
				<NewTab
					writable={writable && !busy}
					onCreateNote={() => void startNote(folder, "Untitled", pane.id)}
					onCreateCanvas={
						canvasShown ? undefined : () => void startCanvas(folder, pane.id)
					}
					onClose={pane.id === "right" ? () => void ws.closeSplit() : undefined}
				/>
			</main>
		);
	};

	const focusedCanvas =
		focusedPane.kind === "canvas" ? focusedPane.active : null;
	const shownPath = focusedCanvas ?? session?.livePath ?? null;
	const shownTitle = focusedCanvas
		? (view?.notes.find((n) => n.path === focusedCanvas)?.title ?? null)
		: (session?.title ?? null);

	return (
		<TooltipProvider>
			<div className="app">
				{showDebug && (
					<DebugPanel
						logger={getLogger()}
						app={appInfo}
						onClose={() => setShowDebug(false)}
					/>
				)}
				{showMaintainer && (
					<MaintainerPanel
						host={host}
						logger={getLogger()}
						app={appInfo}
						onOpenDebug={() => {
							setShowMaintainer(false);
							setShowDebug(true);
						}}
						onClose={() => setShowMaintainer(false)}
					/>
				)}
				<AppearanceProvider host={vaultHost}>
					<AppShell
						vault={vaultName ?? "VaultOps"}
						path={shownPath}
						title={shownTitle}
						notes={view?.notes ?? []}
						writable={writable && !busy}
						selectedFolder={selection.kind === "folder" ? selection.value : ""}
						onOpenNote={(path) => void open(path)}
						onCreateNote={(folder, noteTitle) =>
							void startNote(folder, noteTitle)
						}
						onNavigateScreen={(next) => void navigate(next)}
						canGoBack={canGoBack(nav)}
						canGoForward={canGoForward(nav)}
						onBack={() => void goThrough(-1)}
						onForward={() => void goThrough(1)}
						reading={reading}
						onToggleReading={
							screen === "note" && session?.opened
								? () => setReading((on) => !on)
								: undefined
						}
						stats={screen === "note" && session ? session.stats : null}
						tools={
							<NoteTools
								key={session?.opened?.path}
								outline={session?.outline ?? []}
								hasNote={screen === "note" && !!session?.opened}
								props={session?.props ?? null}
								editable={!!session?.opened?.editable}
								onChange={(next) => session?.editProps(next)}
								onOpenTag={(tag) => setSelection({ kind: "tag", value: tag })}
							/>
						}
						sidebar={
							<Sidebar
								view={view}
								busy={busy}
								maintainer={maintainer}
								selection={selection}
								livePath={shownPath}
								tree={tree}
								treeActions={treeActions}
								treeNotice={treeNotice}
								onStartNote={startNote}
								onStartCanvas={startCanvas}
								onChooseVault={async () => {
									if (!(await ws.settleAll())) return;
									setScreen("note");
									setSelection({ kind: "all" });
									run(() => chooseAndLoad(host));
								}}
								onShowMaintainer={() => setShowMaintainer(true)}
								onNavigate={navigate}
								onSelection={setSelection}
								onOpen={(path) => void open(path, { follow: false })}
							/>
						}
					>
						{screen === "note" ? (
							<div className="editor-stack">
								{error && (
									<p role="alert" className="notice">
										Something went wrong: {error}
									</p>
								)}
								{view?.status === "none" && (
									<p className="empty-pane">
										No vault is open. Choose a folder to start.
									</p>
								)}
								{view && view.status !== "none" && (
									<WorkspacePanes
										host={ws}
										notes={view.notes}
										renderNote={renderNote}
										renderCanvas={renderCanvas}
										renderEmpty={renderEmpty}
									/>
								)}
							</div>
						) : (
							<ScreenPane
								view={view}
								screen={screen}
								error={error}
								busy={busy}
								writable={writable}
								screenNotice={screenNotice}
								updateHost={host}
								trash={trash}
								confirmDelete={confirmDelete}
								onNavigate={navigate}
								onConfirmDelete={setConfirmDelete}
								onRestore={(p) => void changeTrash(p, true)}
								onDelete={(p) => void changeTrash(p, false)}
								onOpen={(path) => void open(path)}
							/>
						)}
					</AppShell>
				</AppearanceProvider>
			</div>
		</TooltipProvider>
	);
}
