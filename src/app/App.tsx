import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LinkRef } from "../core/links/links";
import type { Placement } from "../core/notes/block-move";
import { duplicateNote } from "../core/notes/duplicate";
import {
	createFolder,
	movedPath,
	moveFolder,
	renameFolder,
	within,
} from "../core/notes/folders";
import { type MoveResult, moveNote, renameNote } from "../core/notes/rename";
import { loadNote } from "../core/notes/repository";
import {
	deleteForever,
	listTrash,
	restoreNote,
	type TrashedNote,
	trashFolder,
	trashNote,
} from "../core/notes/trash";
import { buildTree } from "../core/notes/tree";
import {
	listCards,
	loadTypes,
	type ResourceCard,
	type ResourceType,
} from "../core/resources/resources";
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
import { FolderPickerDialog, VAULT_ROOT } from "./FolderPickerDialog";
import { linkedFrom } from "./LinkedFromPanel";
import { browserLastNote, pickInitialNote } from "./last-note";
import { buildLinkSource, linkTargets } from "./link-source";
import { NavBar } from "./NavBar";
import { NewTab } from "./NewTab";
import { NotePickerDialog } from "./NotePickerDialog";
import { NoteTools } from "./NoteTools";
import type { DragItem, TreeActions } from "./NoteTree";
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
import { PlannerProvider } from "./planner/PlannerContext";
import { ResourceManager } from "./ResourceManager";
import { ScreenPane } from "./ScreenPane";
import { SettingsDialog } from "./SettingsScreen";
import { Sidebar } from "./Sidebar";
import {
	chooseAndLoad,
	compareRows,
	createAndLoad,
	createCanvasAndLoad,
	loadVault,
	type VaultView,
} from "./session";
import { newNoteFolder } from "./settings";
import { commandMatches } from "./shortcuts";
import { type Selection, selectionForPath } from "./sidebar-selection";
import { TemplateManager } from "./TemplateManager";
import { browserTabs, pruneTabs } from "./tabs";
import {
	type BlockMoveResult,
	type PaneView,
	useWorkspaceHost,
} from "./useWorkspaceHost";
import { type PaneDoc, WorkspacePanes } from "./WorkspacePanes";
import "../ui/theme.css";
import "./app.css";

const other = (id: PaneId): PaneId => (id === "left" ? "right" : "left");

export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [reading, setReading] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [templatesOpen, setTemplatesOpen] = useState(false);
	const [resourcesOpen, setResourcesOpen] = useState(false);
	// The card a link asked to see; the manager shows it when it opens.
	const [focusResource, setFocusResource] = useState<string | null>(null);
	// The block just moved, with the way to take it back.
	const [moveNotice, setMoveNotice] = useState<{
		text: string;
		undo: () => Promise<{ ok: true } | { ok: false; message: string }>;
	} | null>(null);
	// A canvas card waiting for "Move to…" to be answered.
	const [cardMove, setCardMove] = useState<{
		pane: PaneId;
		blockId: string;
		from: string;
	} | null>(null);
	// The pane whose note the folder picker is choosing a folder for.
	const [movePicker, setMovePicker] = useState<PaneId | null>(null);
	// A note, canvas or folder from the tree's "Move to..." waiting for a folder.
	const [treeMove, setTreeMove] = useState<DragItem | null>(null);
	// Resource cards, kept here so links and search can name them.
	const [resources, setResources] = useState<{
		cards: ResourceCard[];
		types: ResourceType[];
	}>({ cards: [], types: [] });
	const [screen, setScreen] = useState<"note" | "trash" | "health" | "planner">(
		"note",
	);
	const [trash, setTrash] = useState<TrashedNote[]>([]);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	const [screenNotice, setScreenNotice] = useState<string | null>(null);
	// The note a restore just put back, so the trash notice can offer to open it.
	const [restoredPath, setRestoredPath] = useState<string | null>(null);
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
	// A note made from a title that was already typed starts in its body.
	const focusBody = useRef(false);
	// One new note or canvas at a time: a double click makes one, not two.
	const creating = useRef(false);
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
				const sameBody =
					info.text === undefined ||
					(row.text === info.text &&
						(row.links ?? []).join("\n") === (info.links ?? []).join("\n"));
				if (
					!info.titleChanged &&
					sameTags &&
					row.preview === info.preview &&
					sameBody &&
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
										...(info.text === undefined
											? {}
											: { text: info.text, links: info.links ?? [] }),
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
			if (commandMatches(event, "debug")) {
				event.preventDefault();
				if (maintainerRef.current) setShowDebug((v) => !v);
				return;
			}
			if (commandMatches(event, "save")) {
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
		if (!session?.opened || !focusBody.current) return;
		// The editor mounts just after the note is shown: try for a moment.
		// The flag stays up until it worked, so a re-render can't lose it.
		let tries = 0;
		const timer = setInterval(() => {
			const field = document.querySelector<HTMLElement>(
				'.note-editor [contenteditable="true"]',
			);
			field?.focus();
			if (field || ++tries >= 20) {
				focusBody.current = false;
				clearInterval(timer);
			}
		}, 20);
		return () => clearInterval(timer);
	});

	useEffect(() => {
		if (session?.opened && focusTitle.current) {
			focusTitle.current = false;
			titleInputs[ws.focused].current?.focus();
			titleInputs[ws.focused].current?.select();
		}
	});

	const navigate = async (
		next: "trash" | "health" | "settings" | "planner" | "note",
	) => {
		// Settings is a window over the workspace, not a screen: nothing to settle.
		if (next === "settings") {
			setSettingsOpen(true);
			return;
		}
		if (!(await ws.settleAll())) return;
		setBusy(true);
		try {
			if (next === "trash") setTrash(await listTrash(host));
			if (next === "health") changeView(await loadVault(host));
			if (next === "note") {
				// Notes the planner wrote while it was on screen: read them again so a
				// later edit in the pane can't write the old text over the change.
				const touched = plannerTouched.current;
				plannerTouched.current = new Set();
				for (const pane of [left, right]) {
					if (
						pane &&
						pane.kind === "note" &&
						touched.has(pane.session.livePathRef.current ?? "")
					)
						await reloadPane(pane);
				}
			}
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
			setRestoredPath(null);
			setScreen(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	// Notes written by the planner screen (see `navigate`).
	const plannerTouched = useRef(new Set<string>());
	const plannerChanged = async (paths: string[]) => {
		for (const path of paths) plannerTouched.current.add(path);
		changeView(await loadVault(host));
	};

	const changeTrash = async (path: string, restore: boolean) => {
		if (!writable || busy || (!restore && confirmDelete !== path)) return;
		setRestoredPath(null);
		setBusy(true);
		try {
			let message =
				"Note removed from the trash. A copy is kept in .vaultops/recovery in your vault.";
			let restored: string | null = null;
			if (restore) {
				const original = trash.find((t) => t.trashPath === path)?.originalPath;
				restored = (await restoreNote(vaultHost, path)).path;
				const wasIn = original?.includes("/")
					? original.slice(0, original.lastIndexOf("/"))
					: "";
				message = `Restored to ${restored}.`;
				if (wasIn !== "" && !within(restored, wasIn))
					message += ` Its folder "${wasIn}" is gone, so it is in the vault root.`;
			} else await deleteForever(vaultHost, path);
			setRestoredPath(restored);
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
		if (!view || creating.current) return;
		creating.current = true;
		try {
			if (!(await ws.settleAll())) return;
			setBusy(true);
			try {
				const made = await createAndLoad(vaultHost, view, folder, noteTitle);
				changeView(made.view);
				if (made.path) {
					focusTitle.current = noteTitle === "Untitled";
					focusBody.current = noteTitle !== "Untitled";
					await open(made.path, { pane });
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setBusy(false);
			}
		} finally {
			creating.current = false;
		}
	};

	const startCanvas = async (folder = "", pane?: PaneId) => {
		if (!view || creating.current) return;
		creating.current = true;
		try {
			if (!(await ws.settleAll())) return;
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
		} finally {
			creating.current = false;
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

	// After a note goes to the trash there is no question first, because
	// nothing is erased: the notice offers Undo, and the trash keeps it anyway.
	const offerRestore = (trashPath: string, title: string) =>
		setMoveNotice({
			text: `Moved "${title}" to the trash.`,
			undo: async () => {
				try {
					const back = await restoreNote(vaultHost, trashPath);
					changeView(await loadVault(host));
					await open(back.path);
					return { ok: true };
				} catch (e) {
					return {
						ok: false,
						message: e instanceof Error ? e.message : String(e),
					};
				}
			},
		});

	// Moves a pane's note to the vault's trash (nothing is erased).
	const moveToTrash = async (pane: PaneView) => {
		const opened = pane.session.opened;
		if (!opened || !view) return;
		if (!(await ws.settleAll())) return;
		// Read after the save: a title change may just have renamed the file.
		const path = pane.session.livePathRef.current ?? opened.path;
		setBusy(true);
		try {
			const { trashPath } = await trashNote(vaultHost, path);
			const next = await loadVault(host);
			autoOpened.current = false;
			changeView(next);
			const exists = new Set(next.notes.map((n) => n.path));
			await ws.prune((p) => exists.has(p));
			offerRestore(trashPath, pane.session.title.trim() || "Untitled");
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
		where: string | null | (() => string),
		task: () => Promise<{ notice?: string; follow?: (path: string) => string }>,
	) => {
		if (!view || !(await ws.settleAll())) return;
		// Read after the save: a title edit in an open note may have renamed it.
		const affected = typeof where === "function" ? where() : where;
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

	// A tree row's path as it will be after open notes are saved: saving an open
	// note with an edited title renames its file, so actions read it late.
	const afterSave = (path: string) => {
		const pane = [left, right].find(
			(p) =>
				p?.kind === "note" &&
				(p.session.livePathRef.current ?? p.active) === path,
		);
		return () =>
			pane?.kind === "note" ? (pane.session.livePathRef.current ?? path) : path;
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
		deleteNote: (path) => {
			const row = viewRef.current?.notes.find((n) => n.path === path);
			const title =
				row?.title.trim() ||
				path.slice(path.lastIndexOf("/") + 1).replace(/\.vnote$/, "");
			let trashPath: string | undefined;
			const at = afterSave(path);
			void changeTree(at, async () => {
				trashPath = (await trashNote(vaultHost, at())).trashPath;
				return {};
			}).then(() => {
				if (trashPath) offerRestore(trashPath, title);
			});
		},
		move: (item, into) => {
			const at = afterSave(item.path);
			void changeTree(at, async () => {
				if (item.kind === "folder") {
					const r = await moveFolder(vaultHost, item.path, into);
					return {
						notice: r.notice,
						follow: (p) => movedPath(p, item.path, r.path),
					};
				}
				const r = await moveNote(vaultHost, at(), into, {
					readOnly: item.readOnly,
				});
				return { notice: r.notice, follow: () => r.path };
			});
		},
		renameNote: (path, title) => {
			// A note on screen renames through its own title field's save path,
			// so its unsaved edits and the file name stay together.
			const shown = [left, right].find(
				(pane) =>
					pane?.kind === "note" &&
					(pane.session.livePathRef.current ?? pane.active) === path,
			);
			if (shown?.kind === "note") {
				shown.session.editTitle(title);
				void changeTree(null, async () => ({}));
				return;
			}
			const readOnly = viewRef.current?.notes.find(
				(n) => n.path === path,
			)?.readOnly;
			void changeTree(path, async () => {
				const parsed = await loadNote(vaultHost, path);
				if (!parsed.note)
					return {
						notice: "This note could not be read, so it was not renamed.",
					};
				const r = await renameNote(vaultHost, path, parsed.note, title, {
					readOnly,
				});
				return { notice: r.notice, follow: () => r.path };
			});
		},
		// Open notes are saved first (changeTree), so the copy has the latest text.
		duplicateNote: (path) => {
			const readOnly = viewRef.current?.notes.find(
				(n) => n.path === path,
			)?.readOnly;
			const at = afterSave(path);
			void changeTree(null, async () => ({
				notice: (await duplicateNote(vaultHost, at(), { readOnly })).notice,
			}));
		},
		moveTo: setTreeMove,
		newNote: (folder) => void startNote(folder),
		newCanvas: (folder) => void startCanvas(folder),
	};

	// "Move to…": the note goes to the folder picked, its tab follows it, and an
	// Undo notice offers the way back (to the folder it came from).
	const moveNoteTo = async (id: PaneId, folder: string) => {
		setMovePicker(null);
		const pane = ws.panes[id];
		if (pane?.kind !== "note" || !view) return;
		if (!(await ws.settleAll())) return;
		const opened = pane.session.opened;
		if (!opened) return;
		const from = pane.session.livePathRef.current ?? opened.path;
		const fromFolder = from.includes("/")
			? from.slice(0, from.lastIndexOf("/"))
			: "";
		const title = pane.session.title.trim() || "Untitled";
		let result: MoveResult | undefined;
		await changeTree(from, async () => {
			result = await moveNote(vaultHost, from, folder, {
				readOnly: !opened.editable,
			});
			return { notice: result.notice, follow: () => result?.path ?? from };
		});
		if (!result?.moved) return;
		const now = result.path;
		setMoveNotice({
			text: `Moved "${title}" to ${folder === "" ? VAULT_ROOT : folder}.`,
			undo: async () => {
				let back: MoveResult | undefined;
				await changeTree(now, async () => {
					back = await moveNote(vaultHost, now, fromFolder);
					return { notice: back.notice, follow: () => back?.path ?? now };
				});
				return back?.moved
					? { ok: true }
					: {
							ok: false,
							message: back?.notice ?? "The note was not moved back.",
						};
			},
		});
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
	const announceMove = (result: BlockMoveResult) => {
		if (!result.ok || !result.moved) return;
		const { destination, lost, recoveryPath, undo } = result.moved;
		const row = viewRef.current?.notes.find((n) => n.path === destination);
		const plural = (n: number, word: string) =>
			`${n} ${word}${n === 1 ? "" : "s"}`;
		const gave = [
			lost.connectors > 0 ? plural(lost.connectors, "connector") : "",
			lost.groups > 0 ? "its place in a group" : "",
		].filter(Boolean);
		setMoveNotice({
			text:
				`Moved a block to "${row?.title ?? destination}".` +
				(gave.length > 0
					? ` The canvas gave up ${gave.join(" and ")}; Undo brings ${gave.length === 1 && lost.groups === 0 && lost.connectors === 1 ? "it" : "them"} back${recoveryPath ? ", and a copy of the canvas is in the recovery folder" : ""}.`
					: ""),
			undo,
		});
	};

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
		announceMove(result);
	};

	const reloadResources = useCallback(async () => {
		try {
			const [types, cards] = await Promise.all([
				loadTypes(vaultHost),
				listCards(vaultHost),
			]);
			setResources({ cards, types });
		} catch {
			// Links to resources just stay unavailable until the next try.
		}
	}, [vaultHost]);
	// Cards belong to the open vault: load them again when another opens.
	const resourceVault =
		view && view.status !== "none" ? (vaultName ?? "") : null;
	useEffect(() => {
		if (resourceVault === null) {
			setResources({ cards: [], types: [] });
			return;
		}
		void reloadResources();
	}, [resourceVault, reloadResources]);

	const openLink = useRef<(link: LinkRef) => void>(() => {});
	openLink.current = (link) => {
		if (link.kind === "resource") {
			if (!resources.cards.some((card) => card.noteId === link.target)) return;
			setFocusResource(link.target);
			setResourcesOpen(true);
			return;
		}
		const row = viewRef.current?.notes.find((n) => n.id === link.target);
		if (row) void open(row.path);
	};
	const links = useMemo(
		() =>
			buildLinkSource(
				linkTargets(view?.notes ?? [], resources.cards, resources.types),
				(link) => openLink.current(link),
			),
		[view?.notes, resources],
	);

	// The notice goes by itself; Undo itself refuses if anything changed since.
	useEffect(() => {
		if (!moveNotice) return;
		const timer = setTimeout(() => setMoveNotice(null), 20000);
		return () => clearTimeout(timer);
	}, [moveNotice]);

	const renderNote = (pane: PaneView) => (
		<SessionNoteView
			session={pane.session}
			writable={writable}
			reading={reading}
			onToggleReading={() => setReading((on) => !on)}
			busy={busy}
			titleInput={titleInputs[pane.id]}
			onLoadDisk={() => void loadDisk(pane)}
			onSaveCopy={() => void saveCopy(pane)}
			onMoveToTrash={() => void moveToTrash(pane)}
			onMoveTo={() => setMovePicker(pane.id)}
			templates={{ host: vaultHost, onManage: () => setTemplatesOpen(true) }}
			links={links}
			locked={ws.moving}
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
				notes={view?.notes ?? []}
				onOpenNote={(notePath) => void open(notePath, { pane: other(pane.id) })}
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
				onDropBlock={async (blockId, noteId, position) => {
					await dropBlock(pane, blockId, noteId, position);
					// Show the new card. A refused move throws first, and the canvas
					// reloads itself and says why.
					setCanvasKey((count) => count + 1);
				}}
				onMoveTo={(blockId) =>
					setCardMove({ pane: pane.id, blockId, from: pane.active ?? "" })
				}
				onMoveToNote={
					noteBeside
						? async (blockId) => {
								const result = await wsRef.current.blockToNote(
									pane.id,
									blockId,
								);
								if (!result.ok) throw new Error(result.message);
								announceMove(result);
								setCanvasKey((count) => count + 1);
							}
						: undefined
				}
			/>
		);
	};

	// The empty tab, or a pane with no tab: the ways to start. A canvas is not
	// offered while another pane already shows one (two never show together).
	const renderTitleBar = (_pane: PaneView, doc: PaneDoc) => (
		<NavBar
			vault={vaultName ?? "VaultOps"}
			path={doc.path}
			title={doc.title}
			controls={doc.focused}
			calendar={doc.last}
			canGoBack={canGoBack(nav)}
			canGoForward={canGoForward(nav)}
			onBack={() => void goThrough(-1)}
			onForward={() => void goThrough(1)}
		/>
	);
	const renderEmpty = (pane: PaneView) => {
		const canvasShown = [left, right].some(
			(p) => p && p.id !== pane.id && p.kind === "canvas",
		);
		const folder = selection.kind === "folder" ? selection.value : "";
		return (
			<main className="pane">
				<NewTab
					writable={writable && !busy}
					onCreateNote={() =>
						void startNote(
							newNoteFolder(folder, view?.folders ?? []),
							"Untitled",
							pane.id,
						)
					}
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
					<PlannerProvider
						notes={view?.notes ?? []}
						host={vaultHost}
						writable={writable}
						onChanged={plannerChanged}
						onOpenNote={(path) => void open(path)}
						onOpenScreen={() => void navigate("planner")}
					>
						<AppShell
							vault={vaultName ?? "VaultOps"}
							path={shownPath}
							title={shownTitle}
							notes={view?.notes ?? []}
							writable={writable && !busy}
							selectedFolder={
								selection.kind === "folder" ? selection.value : ""
							}
							onOpenNote={(path) => void open(path)}
							onCreateNote={(folder, noteTitle) =>
								void startNote(
									newNoteFolder(folder, view?.folders ?? []),
									noteTitle,
								)
							}
							onNavigateScreen={(next) => void navigate(next)}
							resources={resources.cards}
							resourceTypes={resources.types}
							onOpenResource={(noteId) => {
								setFocusResource(noteId);
								setResourcesOpen(true);
							}}
							onOpenResources={
								view && view.status !== "none"
									? () => {
											setFocusResource(null);
											setResourcesOpen(true);
										}
									: undefined
							}
							onOpenTemplates={
								view && view.status !== "none"
									? () => setTemplatesOpen(true)
									: undefined
							}
							titleInPanes={
								screen === "note" && !!view && view.status !== "none"
							}
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
							onMoveNote={
								screen === "note" &&
								focusedPane.kind === "note" &&
								session?.opened?.editable
									? () => setMovePicker(focusedPane.id)
									: undefined
							}
							stats={screen === "note" && session ? session.stats : null}
							tools={
								<NoteTools
									key={session?.opened?.path}
									notes={view?.notes ?? []}
									activeTag={selection.kind === "tag" ? selection.value : null}
									outline={session?.outline ?? []}
									linkedFrom={linkedFrom(
										view?.notes ?? [],
										session?.opened?.note?.header.noteId,
									)}
									onOpenNote={(path) => void open(path)}
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
									onStartNote={(folder) =>
										void startNote(newNoteFolder(folder, view?.folders ?? []))
									}
									onStartCanvas={startCanvas}
									onChooseVault={async () => {
										if (!(await ws.settleAll())) return;
										setScreen("note");
										setSelection({ kind: "all" });
										run(() => chooseAndLoad(host));
									}}
									onShowMaintainer={() => setShowMaintainer(true)}
									onNavigate={navigate}
									onOpenSettings={() => void navigate("settings")}
									onOpenTemplates={() => setTemplatesOpen(true)}
									onOpenResources={() => {
										setFocusResource(null);
										setResourcesOpen(true);
									}}
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
									{moveNotice && (
										<p role="status" className="notice move-notice">
											{moveNotice.text}{" "}
											<Button
												size="sm"
												variant="outline"
												onClick={() => {
													const { undo } = moveNotice;
													setMoveNotice(null);
													void undo().then((result) => {
														if (!result.ok) setError(result.message);
														setCanvasKey((count) => count + 1);
													});
												}}
											>
												Undo
											</Button>{" "}
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setMoveNotice(null)}
											>
												Dismiss
											</Button>
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
											renderTitleBar={renderTitleBar}
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
									restoredPath={restoredPath}
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
						<NotePickerDialog
							open={cardMove !== null}
							onOpenChange={(next) => {
								if (!next) setCardMove(null);
							}}
							title="Move card to"
							notes={(view?.notes ?? []).filter(
								(n) => !n.readOnly && n.path !== cardMove?.from,
							)}
							onPick={(row) => {
								const move = cardMove;
								setCardMove(null);
								if (!move) return;
								void (async () => {
									const result = await wsRef.current.blockToPath(
										move.pane,
										move.blockId,
										row.path,
									);
									if (!result.ok) setError(result.message);
									else announceMove(result);
									setCanvasKey((count) => count + 1);
								})();
							}}
						/>
						<FolderPickerDialog
							open={movePicker !== null}
							onOpenChange={(next) => {
								if (!next) setMovePicker(null);
							}}
							folders={view?.folders ?? []}
							current={(() => {
								const pane = movePicker ? ws.panes[movePicker] : null;
								const path =
									pane?.kind === "note"
										? (pane.session.livePathRef.current ?? pane.active ?? "")
										: "";
								return path.includes("/")
									? path.slice(0, path.lastIndexOf("/"))
									: "";
							})()}
							title="Move note to"
							onPick={(folder) =>
								movePicker && void moveNoteTo(movePicker, folder)
							}
						/>
						<FolderPickerDialog
							open={treeMove !== null}
							onOpenChange={(next) => {
								if (!next) setTreeMove(null);
							}}
							// A folder can't go inside itself or one of its own folders.
							folders={(view?.folders ?? []).filter(
								(f) =>
									treeMove?.kind !== "folder" ||
									(f !== treeMove.path && !f.startsWith(`${treeMove.path}/`)),
							)}
							current={
								treeMove?.path.includes("/")
									? treeMove.path.slice(0, treeMove.path.lastIndexOf("/"))
									: ""
							}
							title={treeMove?.kind === "folder" ? "Move folder to" : "Move to"}
							onPick={(folder) => {
								const item = treeMove;
								setTreeMove(null);
								if (item) treeActions.move(item, folder);
							}}
						/>
						<TemplateManager
							host={vaultHost}
							notes={(view?.notes ?? []).filter((n) => n.kind !== "canvas")}
							writable={writable}
							open={templatesOpen}
							onClose={() => setTemplatesOpen(false)}
						/>
						<ResourceManager
							host={vaultHost}
							writable={writable}
							open={resourcesOpen}
							focusId={focusResource}
							onOpenNote={(path) => {
								setResourcesOpen(false);
								void open(path);
							}}
							onClose={() => {
								setResourcesOpen(false);
								setFocusResource(null);
								void reloadResources();
							}}
						/>
						<SettingsDialog
							open={settingsOpen}
							onOpenChange={setSettingsOpen}
							host={host}
						/>
					</PlannerProvider>
				</AppearanceProvider>
			</div>
		</TooltipProvider>
	);
}
