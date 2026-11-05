import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseNote } from "../core/note-format";
import {
	createFolder,
	movedPath,
	moveFolder,
	renameFolder,
	within,
} from "../core/notes/folders";
import { moveBlock } from "../core/notes/move-block";
import { type OutlineItem, outlineOf } from "../core/notes/outline";
import { headerProps, type Props as NoteProps } from "../core/notes/properties";
import { moveNote } from "../core/notes/rename";
import { type TextStats, textStats } from "../core/notes/text-stats";
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
import { buildRecoveryText, joinRecovery } from "../core/session/recovery";
import { DebugPanel } from "../debug/DebugPanel";
import { getLogger } from "../debug/index";
import { MaintainerPanel } from "../debug/MaintainerPanel";
import {
	allowEditing,
	lockedForReadOnlyVault,
	type OpenedNote,
	openNote,
} from "../editor/note-io";
import { createQuitGuard } from "../editor/quit";
import { type Draft, saveAsCopy } from "../editor/save-draft";
import {
	isSaveForOpenNote,
	type SavedInfo,
	useAutosave,
} from "../editor/useAutosave";
import type { Host } from "../host/host";
import { readOnlyHost } from "../host/read-only-host";
import { AppShell } from "./AppShell";
import { CanvasPane } from "./CanvasPane";
import { canvasLayout, lastCanvas, saveCanvasLayout } from "./canvas-layout";
import { browserLastNote, pickInitialNote } from "./last-note";
import { NewTab } from "./NewTab";
import { NotePane } from "./NotePane";
import { NoteTools } from "./NoteTools";
import type { TreeActions } from "./NoteTree";
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
import type { TabItem } from "./TabBar";
import {
	browserTabs,
	closeTab,
	NEW_TAB,
	openTab,
	pruneTabs,
	renameTab,
} from "./tabs";
import "../ui/theme.css";
import "./app.css";

/** The window keeps note and save state outside its collapsible sidebars. */
// How long writing must pause before the status bar recounts.
const STATS_DELAY_MS = 300;

export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [screen, setScreen] = useState<
		"note" | "trash" | "health" | "settings"
	>("note");
	const [trash, setTrash] = useState<TrashedNote[]>([]);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	const [confirmEditing, setConfirmEditing] = useState(false);
	const [screenNotice, setScreenNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openedNote, setOpened] = useState<OpenedNote | null>(null);
	const [editorRevision, setEditorRevision] = useState(0);
	const [canvasPath, setCanvasPath] = useState<string | null>(null);
	// The empty tab: "none" = no such tab, "open" = in the tab bar but another tab
	// is showing, "active" = it is the one showing (the editor area is blank).
	const [newTab, setNewTab] = useState<"none" | "open" | "active">("none");
	const newTabRef = useRef(newTab);
	const changeNewTab = (next: "none" | "open" | "active") => {
		newTabRef.current = next;
		setNewTab(next);
	};
	const [canvasRefresh, setCanvasRefresh] = useState(0);
	const [focusCanvas, setFocusCanvas] = useState(false);
	// A canvas fills the editor as its own tab (the note is put away meanwhile).
	const [canvasTab, setCanvasTab] = useState(false);
	// Split view: a canvas (or an empty pane to pick one) beside the open note.
	const [split, setSplit] = useState(false);
	const splitRef = useRef(false);
	const changeSplit = (next: boolean) => {
		splitRef.current = next;
		setSplit(next);
	};
	const [defaultCanvasLayout] = useState(canvasLayout);
	// Opening a vault may create it, so loading and choosing a vault use `host`.
	// Everything that changes notes and folders goes through `vaultHost`, which
	// refuses every write unless the vault is writable. Even a missed check in a
	// screen cannot change a read-only vault.
	const writable = view?.writable === true;
	const vaultHost = useMemo(
		() => (writable ? host : readOnlyHost(host)),
		[host, writable],
	);
	const opened = useMemo(
		() =>
			openedNote && !writable ? lockedForReadOnlyVault(openedNote) : openedNote,
		[openedNote, writable],
	);
	const [livePath, setLivePath] = useState<string | null>(null);
	// Open-note tabs. The state carries its vault, so tabs from one vault are
	// never shown (or saved) under another while a vault switch settles.
	const [tabState, setTabState] = useState<{
		vault: string | null;
		paths: string[];
	}>({ vault: null, paths: [] });
	const tabStore = useRef(browserTabs());
	// Back and forward through opened notes; like the tabs, tied to one vault.
	const [navState, setNavState] = useState<{
		vault: string | null;
		history: NavHistory;
	}>({ vault: null, history: EMPTY_NAV });
	const tree = useMemo(
		() => (view ? buildTree(view.folders, view.notes) : []),
		[view],
	);
	const [title, setTitle] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const docRef = useRef(opened?.doc ?? null);
	// Counts for the status bar. Typing only schedules a recount, so a long
	// note is counted once the writing pauses, never on every key.
	const [stats, setStats] = useState<TextStats | null>(null);
	const [outline, setOutline] = useState<OutlineItem[]>([]);
	const statsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const refreshStats = () => {
		clearTimeout(statsTimer.current);
		statsTimer.current = setTimeout(() => {
			setStats(textStats(docRef.current));
			setOutline(outlineOf(docRef.current));
		}, STATS_DELAY_MS);
	};
	useEffect(() => () => clearTimeout(statsTimer.current), []);
	const titleRef = useRef("");
	const titleInput = useRef<HTMLInputElement>(null);
	const focusTitle = useRef(false);
	const lastNotes = useRef(browserLastNote());
	const autoOpened = useRef(false);
	const livePathRef = useRef<string | null>(null);
	const [showDebug, setShowDebug] = useState(false);
	const [maintainer, setMaintainer] = useState(false);
	const maintainerRef = useRef(false);
	const [showMaintainer, setShowMaintainer] = useState(false);
	const [appInfo, setAppInfo] = useState({ name: "vaultops", version: "?" });
	const [confirmTrash, setConfirmTrash] = useState(false);
	const [treeNotice, setTreeNotice] = useState<string | null>(null);
	const [props, setProps] = useState<NoteProps | null>({});
	const propsRef = useRef<NoteProps | null>({});
	const [selection, setSelection] = useState<Selection>({ kind: "all" });
	const vaultName = view?.name ?? null;
	const viewRef = useRef(view);
	viewRef.current = view;
	const tabs = tabState.vault === vaultName ? tabState.paths : [];
	const nav = navState.vault === vaultName ? navState.history : EMPTY_NAV;
	useEffect(() => {
		setNavState({ vault: vaultName, history: EMPTY_NAV });
	}, [vaultName]);
	useEffect(() => {
		// Bring back this vault's tabs (for notes that still exist) when it opens.
		const notes = viewRef.current?.notes ?? [];
		setTabState({
			vault: vaultName,
			paths: vaultName
				? pruneTabs(
						tabStore.current.get(vaultName),
						notes.map((n) => n.path),
					)
				: [],
		});
	}, [vaultName]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: only a vault change closes the empty tab
	useEffect(() => {
		newTabRef.current = "none";
		setNewTab("none");
		setCanvasTab(false);
		splitRef.current = false;
		setSplit(false);
	}, [vaultName]);
	useEffect(() => {
		// A canvas that was trashed or deleted can no longer fill the editor.
		if (!view || !canvasTab) return;
		if (!view.notes.some((n) => n.path === canvasPath && n.kind === "canvas"))
			setCanvasTab(false);
	}, [view, canvasTab, canvasPath]);
	useEffect(() => {
		// A note or canvas that was trashed, deleted or moved loses its tab.
		if (!view) return;
		const all = view.notes.map((n) => n.path);
		const existing = view.notes
			.filter((n) => n.kind !== "canvas")
			.map((n) => n.path);
		setTabState((state) => {
			const paths = pruneTabs(state.paths, all);
			return paths === state.paths ? state : { ...state, paths };
		});
		setNavState((state) => {
			const history = pruneEntries(state.history, existing);
			return history === state.history ? state : { ...state, history };
		});
	}, [view]);
	useEffect(() => {
		if (tabState.vault !== null && tabState.vault === vaultName)
			tabStore.current.set(tabState.vault, tabState.paths);
	}, [tabState, vaultName]);
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

	const onSaved = useCallback((info: SavedInfo) => {
		if (isSaveForOpenNote(info, livePathRef.current)) {
			setNotice(info.notice ?? null);
			livePathRef.current = info.path;
			setLivePath(info.path);
		}
		if (info.oldPath !== info.path) {
			setTabState((state) => ({
				...state,
				paths: renameTab(state.paths, info.oldPath, info.path),
			}));
			setNavState((state) => ({
				...state,
				history: renameEntry(state.history, info.oldPath, info.path),
			}));
		}
		setView((v) => {
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
	}, []);

	const autosave = useAutosave(vaultHost, opened, onSaved);
	const flushRef = useRef(autosave.flush);
	flushRef.current = autosave.flush;

	// Leaving a note (open another, change vault) first saves it; if that
	// fails the note stays open so nothing typed is lost.
	const settle = useCallback(async () => {
		if (await flushRef.current()) return true;
		setError("This note is not saved yet. Retry saving before leaving it.");
		return false;
	}, []);

	const show = useCallback(
		async (
			path: string,
			vault: string | null,
			follow = true,
			record = true,
		) => {
			try {
				setError(null);
				const started = performance.now();
				const next = await openNote(host, path);
				// Opening something from the active empty tab replaces that tab.
				if (newTabRef.current === "active") {
					newTabRef.current = "none";
					setNewTab("none");
				}
				if (next.note?.header.kind === "canvas") {
					// A canvas is a tab of its own: it fills the editor and any open
					// note (already saved by the caller) is put away.
					selectCanvas(path);
					setTabState((state) => ({
						...state,
						paths: openTab(state.paths, path),
					}));
					setScreen("note");
					// In split view beside an open note, the canvas takes the right pane.
					if (splitRef.current && livePathRef.current) return;
					splitRef.current = false;
					setSplit(false);
					setCanvasTab(true);
					setOpened(null);
					livePathRef.current = null;
					setLivePath(null);
					return;
				}
				getLogger().log({
					kind: "perf",
					name: "note-open",
					ms: Math.round(performance.now() - started),
					ok: true,
					detail: { editable: next.editable },
				});
				docRef.current = next.doc;
				setStats(textStats(next.doc));
				setOutline(outlineOf(next.doc));
				const text =
					typeof next.note?.header.title === "string"
						? next.note.header.title
						: path;
				titleRef.current = text;
				setTitle(text);
				setNotice(next.notice ?? null);
				livePathRef.current = path;
				setLivePath(path);
				setTabState((state) => ({
					...state,
					paths: openTab(state.paths, path),
				}));
				if (record)
					setNavState((state) => ({
						...state,
						history: visit(state.history, path),
					}));
				if (follow) setSelection(selectionForPath(path));
				const loaded = headerProps(next.note?.header);
				propsRef.current = loaded;
				setProps(loaded);
				setConfirmTrash(false);
				setConfirmEditing(false);
				setCanvasTab(false);
				setScreen("note");
				setOpened(next);
				setEditorRevision((revision) => revision + 1);
				if (vault) lastNotes.current.set(vault, path);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host, selectCanvas],
	);

	const open = useCallback(
		async (path: string, follow = true) => {
			if (!(await settle())) return;
			await show(path, vaultName, follow);
		},
		[settle, show, vaultName],
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
				void flushRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Saving on quit: the window waits for the save, and stays open if it fails.
	useEffect(() => {
		let remove: (() => void) | undefined;
		let gone = false;
		host
			.onCloseRequested(
				createQuitGuard(
					() => flushRef.current(),
					// Closing with edits that could not be saved: keep their text.
					async () => {
						const doc = docRef.current;
						if (!doc) return true;
						const fresh = buildRecoveryText({
							path: livePathRef.current,
							title: titleRef.current,
							doc,
							now: new Date(),
						});
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

	const run = useCallback(async (task: () => Promise<VaultView | null>) => {
		setBusy(true);
		setError(null);
		try {
			const next = await task();
			if (next) {
				autoOpened.current = false;
				setView(next);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, []);

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
			opened ||
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
		if (pick) void show(pick, view.name);
		else {
			// No note to reopen: reopen the last canvas (or the first) as a tab.
			const canvas =
				view.notes.find(
					(row) => row.path === rememberedCanvas && row.kind === "canvas",
				) ?? view.notes.find((row) => row.kind === "canvas");
			if (canvas) void show(canvas.path, view.name);
		}
	}, [view, opened, show, screen, canvasPath]);

	useEffect(() => {
		if (opened && focusTitle.current) {
			focusTitle.current = false;
			titleInput.current?.focus();
			titleInput.current?.select();
		}
	}, [opened]);

	const navigate = async (next: "trash" | "health" | "settings" | "note") => {
		if (!(await settle())) return;
		setBusy(true);
		try {
			if (next === "trash") setTrash(await listTrash(host));
			if (next === "health") setView(await loadVault(host));
			if (
				next === "note" &&
				view?.report.some((e) => e.path === livePathRef.current)
			)
				await show(livePathRef.current as string, vaultName);
			else {
				autoOpened.current = true;
				setOpened(null);
			}
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
			setView(next);
			setConfirmDelete(null);
			setScreenNotice(message);
		} catch (e) {
			setScreenNotice(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const startNote = async (folder = "", noteTitle = "Untitled") => {
		if (!view || !(await settle())) return;
		setBusy(true);
		try {
			const made = await createAndLoad(vaultHost, view, folder, noteTitle);
			setView(made.view);
			if (made.path) {
				focusTitle.current = noteTitle === "Untitled";
				await show(made.path, made.view.name);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const startCanvas = async (folder = "") => {
		if (!view || !(await settle())) return;
		setBusy(true);
		try {
			const made = await createCanvasAndLoad(vaultHost, view, folder);
			setView(made.view);
			if (made.path) {
				await show(made.path, made.view.name);
				setFocusCanvas(true);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	// Back and forward reopen the previous or next note in the history without
	// adding to it. The open note is saved first, as with any other navigation.
	const goThrough = async (direction: -1 | 1) => {
		const moved = step(nav, direction);
		if (!moved) return;
		if (!(await settle())) return;
		setNavState((state) => ({ ...state, history: moved.history }));
		await show(moved.path, vaultName, true, false);
	};

	// Closing the open note's tab saves it first, then shows the neighboring tab
	// (or an empty editor when it was the last one).
	const closeNoteTab = async (path: string) => {
		const closing = closeTab(tabs, path);
		const fullCanvas = canvasTab && path === canvasPath;
		if (split && !canvasTab && path === canvasPath) {
			// Closing the canvas that is in the split pane ends the split.
			changeSplit(false);
			setTabState((state) => ({ ...state, paths: closing.tabs }));
			return;
		}
		if (path !== livePathRef.current && !fullCanvas) {
			setTabState((state) => ({ ...state, paths: closing.tabs }));
			return;
		}
		if (!fullCanvas && !(await settle())) return;
		setTabState((state) => ({ ...state, paths: closing.tabs }));
		if (fullCanvas) setCanvasTab(false);
		if (closing.next) {
			// A canvas can only follow a note into the editor as a full tab.
			if (view?.notes.find((n) => n.path === closing.next)?.kind === "canvas")
				changeSplit(false);
			await show(closing.next, vaultName);
			return;
		}
		setOpened(null);
		livePathRef.current = null;
		setLivePath(null);
		// Nothing left but the empty tab: it fills the editor.
		if (newTabRef.current === "open") changeNewTab("active");
	};

	// Right-click a tab, "Split view": a canvas opens beside the open note; for a
	// note, that note opens and the right pane starts empty to pick a canvas in.
	const splitView = async (path: string) => {
		if (!view || !(await settle())) return;
		const isCanvas = view.notes.find((n) => n.path === path)?.kind === "canvas";
		if (newTabRef.current === "active") changeNewTab("open");
		let note = livePathRef.current;
		if (!note || (!isCanvas && note !== path)) {
			note = isCanvas
				? ([...tabs]
						.reverse()
						.find(
							(tab) =>
								view.notes.find((n) => n.path === tab)?.kind !== "canvas",
						) ?? null)
				: path;
			if (!note) {
				setError("Open a note first, then split the view beside it.");
				return;
			}
			await show(note, vaultName);
		}
		changeSplit(true);
		if (isCanvas) {
			selectCanvas(path);
			setTabState((state) => ({ ...state, paths: openTab(state.paths, path) }));
		} else selectCanvas(null);
	};

	// "+": show the empty tab (the open note is saved and put away first).
	const openNewTab = async () => {
		if (!(await settle())) return;
		changeNewTab("active");
		setCanvasTab(false);
		changeSplit(false);
		setScreen("note");
		setOpened(null);
		livePathRef.current = null;
		setLivePath(null);
	};

	// Closing the empty tab: when it was showing, the last note tab takes over.
	const closeNewTab = async () => {
		const wasActive = newTabRef.current === "active";
		changeNewTab("none");
		const last = tabs[tabs.length - 1];
		if (wasActive && last) await open(last);
	};

	// The canvas to show: filling the editor when its tab is the active one, or in
	// the split pane beside the note. A split with no canvas yet shows an empty pane.
	const canvasExists =
		!!canvasPath &&
		!!view?.notes.some(
			(row) => row.path === canvasPath && row.kind === "canvas",
		);
	const shownCanvas =
		screen === "note" && canvasTab && canvasExists ? canvasPath : null;
	const splitOpen = screen === "note" && split && !canvasTab;
	const splitCanvas = splitOpen && canvasExists ? canvasPath : null;
	const paneCanvas = shownCanvas ?? splitCanvas;

	const noteTabs: TabItem[] = tabs.map((path) => {
		const row = view?.notes.find((n) => n.path === path);
		const canvas = row?.kind === "canvas";
		const active =
			screen === "note" &&
			(canvas
				? path === (shownCanvas ?? splitCanvas)
				: !!opened && path === livePath);
		const name =
			path
				.split("/")
				.pop()
				?.replace(/\.vnote$/, "") ?? path;
		return {
			path,
			title: (active && !canvas && title) || row?.title || name,
			active,
			canvas,
		};
	});
	const tabItems: TabItem[] =
		newTab === "none"
			? noteTabs
			: [
					...noteTabs,
					{
						path: NEW_TAB,
						title: "New tab",
						active: screen === "note" && newTab === "active",
					},
				];

	// Moves the open note to the vault's trash (nothing is erased).
	const moveToTrash = async () => {
		if (!opened || !view) return;
		setConfirmTrash(false);
		if (!(await settle())) return;
		// Read after the save: a title change may just have renamed the file.
		const path = livePathRef.current ?? opened.path;
		setBusy(true);
		try {
			setOpened(null);
			await trashNote(vaultHost, path);
			const next = await loadVault(host);
			autoOpened.current = false;
			setView(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			await show(path, vaultName);
		} finally {
			setBusy(false);
		}
	};

	// A folder action from the tree (make, rename, move, trash). The open note is
	// saved first. If the change touches the folder it lives in, it is closed for
	// the change and shown again at its new path, or stays closed when its folder
	// went to the trash.
	const changeTree = async (
		affected: string | null,
		task: () => Promise<{ notice?: string; follow?: (path: string) => string }>,
	) => {
		if (!view || !(await settle())) return;
		setTreeNotice(null);
		const live = livePathRef.current;
		const touched =
			live !== null && affected !== null && within(live, affected);
		setBusy(true);
		try {
			if (touched) {
				// Closing the note must not trigger "reopen the last note" while the
				// folder is still being changed.
				autoOpened.current = true;
				setOpened(null);
			}
			const done = await task();
			if (done.notice) setTreeNotice(done.notice);
			const next = await loadVault(host);
			setView(next);
			const target = touched && done.follow ? done.follow(live) : null;
			if (target) await show(target, next.name);
			else if (touched) autoOpened.current = false;
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			if (touched) await show(live, vaultName);
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
	const loadDisk = async () => {
		const path = livePathRef.current ?? opened?.path;
		if (!path) return;
		autosave.discard();
		await show(path, vaultName);
	};

	// ...or keep my edits as a separate note, leaving the file alone.
	const saveCopy = async () => {
		const draft = autosave.peek();
		if (!opened || !draft) return;
		const path = livePathRef.current ?? opened.path;
		const result = await saveAsCopy(vaultHost, { ...opened, path }, draft);
		if (!result.ok) {
			setError(`The copy was not saved: ${result.message}`);
			return;
		}
		autosave.discard();
		setView(await loadVault(host));
		await show(result.path, vaultName);
	};

	// What gets saved: the body, the title and, unless the file keeps its props in a
	// form we can't edit, the properties.
	const draftOf = (doc: JSONContent, title: string): Draft => ({
		doc,
		title,
		...(propsRef.current ? { props: propsRef.current } : {}),
	});

	const editProps = (next: NoteProps) => {
		propsRef.current = next;
		setProps(next);
		if (docRef.current)
			autosave.change(draftOf(docRef.current, titleRef.current), opened);
	};

	const notePane = (
		<NotePane
			props={props}
			path={livePath}
			onPropsChange={editProps}
			view={view}
			screen={screen}
			error={error}
			busy={busy}
			writable={writable}
			screenNotice={screenNotice}
			updateHost={host}
			trash={trash}
			confirmDelete={confirmDelete}
			opened={opened}
			editorRevision={editorRevision}
			liveDoc={docRef.current}
			title={title}
			titleInput={titleInput}
			saveState={autosave.state}
			confirmTrash={confirmTrash}
			confirmEditing={confirmEditing}
			notice={notice}
			onTitleChange={(next) => {
				titleRef.current = next;
				setTitle(next);
				if (docRef.current)
					autosave.change(draftOf(docRef.current, next), opened);
			}}
			onDocChange={(doc) => {
				docRef.current = doc;
				refreshStats();
				getLogger().count("edits");
				autosave.change(draftOf(doc, titleRef.current), opened);
			}}
			onDropBlock={async (blockId, canvasId, after) => {
				let moveStarted = false;
				try {
					if (!writable || !opened?.editable || !opened.note)
						throw new Error(
							"This note is read-only, so the block was not moved.",
						);
					if (
						!canvasPath ||
						!view?.notes.some(
							(row) => row.path === canvasPath && row.kind === "canvas",
						)
					)
						throw new Error("Open the source canvas before moving this block.");
					if (!(await settle()))
						throw new Error(
							`Save the note before moving a block: ${autosave.failureReason() ?? "the save did not finish"}.`,
						);
					const source = await vaultHost.readText(canvasPath);
					const parsed = parseNote(source);
					if (
						parsed.note?.header.kind !== "canvas" ||
						parsed.note.header.noteId !== canvasId
					)
						throw new Error("The dragged block is not on the open canvas.");
					const destination = livePathRef.current ?? opened.path;
					moveStarted = true;
					await moveBlock(vaultHost, canvasPath, destination, blockId, {
						after,
					});
					await show(destination, vaultName);
					setCanvasRefresh((count) => count + 1);
				} catch (reason) {
					if (moveStarted && opened) {
						await show(livePathRef.current ?? opened.path, vaultName);
						setCanvasRefresh((count) => count + 1);
					}
					setError(String(reason));
				}
			}}
			blank={
				<NewTab
					writable={writable && !busy}
					onCreateNote={() =>
						void startNote(selection.kind === "folder" ? selection.value : "")
					}
					onCreateCanvas={() =>
						void startCanvas(selection.kind === "folder" ? selection.value : "")
					}
				/>
			}
			onRetry={autosave.retry}
			onLoadDisk={loadDisk}
			onSaveCopy={saveCopy}
			onMoveToTrash={moveToTrash}
			onConfirmTrash={setConfirmTrash}
			onConfirmEditing={setConfirmEditing}
			onAllowEditing={() => {
				if (!opened) return;
				setOpened(allowEditing(opened));
				setNotice(null);
				setConfirmEditing(false);
			}}
			onNavigate={navigate}
			onConfirmDelete={setConfirmDelete}
			onRestore={(p) => void changeTrash(p, true)}
			onDelete={(p) => void changeTrash(p, false)}
			onOpen={open}
		/>
	);

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
				<AppShell
					vault={vaultName ?? "VaultOps"}
					path={shownCanvas ?? livePath}
					title={
						shownCanvas
							? (view?.notes.find((n) => n.path === shownCanvas)?.title ?? null)
							: opened
								? title
								: null
					}
					notes={view?.notes ?? []}
					writable={writable && !busy}
					selectedFolder={selection.kind === "folder" ? selection.value : ""}
					onOpenNote={(path) => void open(path)}
					onCreateNote={(folder, noteTitle) =>
						void startNote(folder, noteTitle)
					}
					onNavigateScreen={(next) => void navigate(next)}
					tabs={tabItems}
					onSelectTab={(path) => {
						if (path === NEW_TAB) {
							if (newTab !== "active" || screen !== "note") void openNewTab();
							return;
						}
						// Picking a tab keeps the empty tab, only not showing.
						if (newTab === "active") changeNewTab("open");
						if (!tabItems.find((tab) => tab.path === path)?.active)
							void open(path);
					}}
					onCloseTab={(path) =>
						void (path === NEW_TAB ? closeNewTab() : closeNoteTab(path))
					}
					onNewTab={() => void openNewTab()}
					onSplitTab={(path) => void splitView(path)}
					splitOpen={splitOpen}
					onCloseSplit={() => changeSplit(false)}
					canGoBack={canGoBack(nav)}
					canGoForward={canGoForward(nav)}
					onBack={() => void goThrough(-1)}
					onForward={() => void goThrough(1)}
					stats={
						screen === "note" && opened && opened.note?.header.kind !== "canvas"
							? stats
							: null
					}
					tools={
						<NoteTools
							key={opened?.path}
							outline={outline}
							hasNote={
								screen === "note" &&
								!!opened &&
								opened.note?.header.kind !== "canvas"
							}
							props={props}
							editable={!!opened?.editable}
							onChange={editProps}
							onOpenTag={(tag) => setSelection({ kind: "tag", value: tag })}
						/>
					}
					sidebar={
						<Sidebar
							view={view}
							busy={busy}
							maintainer={maintainer}
							selection={selection}
							livePath={livePath}
							tree={tree}
							treeActions={treeActions}
							treeNotice={treeNotice}
							onStartNote={startNote}
							onStartCanvas={startCanvas}
							onChooseVault={async () => {
								if (!(await settle())) return;
								setOpened(null);
								setScreen("note");
								setSelection({ kind: "all" });
								run(() => chooseAndLoad(host));
							}}
							onShowMaintainer={() => setShowMaintainer(true)}
							onNavigate={navigate}
							onSelection={setSelection}
							onOpen={(path) => void open(path, false)}
						/>
					}
				>
					<ResizablePanelGroup
						key={shownCanvas ? "canvas" : splitOpen ? "split" : "note"}
						orientation="horizontal"
						className="editor-split"
						defaultLayout={splitOpen ? defaultCanvasLayout : undefined}
						onLayoutChanged={(layout) => {
							if (splitOpen) saveCanvasLayout(layout);
						}}
					>
						{!shownCanvas && (
							<ResizablePanel id="note" minSize="25%">
								{notePane}
							</ResizablePanel>
						)}
						{splitOpen && !splitCanvas && (
							<>
								<ResizableHandle />
								<ResizablePanel id="canvas" minSize="25%">
									<div className="split-empty">
										<NewTab
											writable={writable && !busy}
											onCreateCanvas={() =>
												void startCanvas(
													selection.kind === "folder" ? selection.value : "",
												)
											}
											onClose={() => changeSplit(false)}
										/>
									</div>
								</ResizablePanel>
							</>
						)}
						{paneCanvas && view && (
							<>
								{splitCanvas && <ResizableHandle />}
								<ResizablePanel id="canvas" minSize="25%">
									<CanvasPane
										key={canvasRefresh}
										host={vaultHost}
										path={paneCanvas}
										canvases={view.notes.filter((row) => row.kind === "canvas")}
										writable={writable}
										focusName={focusCanvas}
										onFocusedName={() => setFocusCanvas(false)}
										onSelect={(next) => void open(next)}
										onRename={(oldPath, newPath, nextTitle) => {
											selectCanvas(newPath);
											setTabState((state) => ({
												...state,
												paths: renameTab(state.paths, oldPath, newPath),
											}));
											setView((v) =>
												v
													? {
															...v,
															report: v.report.map((e) =>
																e.path === oldPath
																	? { ...e, path: newPath }
																	: e,
															),
															notes: v.notes
																.map((n) =>
																	n.path === oldPath
																		? {
																				...n,
																				path: newPath,
																				title: nextTitle,
																			}
																		: n,
																)
																.sort(compareRows),
														}
													: v,
											);
										}}
										onNew={() => void startCanvas()}
										onClose={() =>
											splitCanvas
												? changeSplit(false)
												: void closeNoteTab(paneCanvas)
										}
										onDropBlock={async (blockId, noteId, position) => {
											if (!writable)
												throw new Error(
													"This vault is read-only, so the block was not moved.",
												);
											if (opened && !opened.editable)
												throw new Error(
													opened.notice ??
														"This note is read-only, so the block was not moved.",
												);
											if (
												!opened?.note ||
												opened.note.header.kind === "canvas" ||
												opened.note.header.noteId !== noteId
											)
												throw new Error(
													"Open the source note before moving this block.",
												);
											if (!(await settle()))
												throw new Error(
													`Save the note before moving a block: ${autosave.failureReason() ?? "the save did not finish"}.`,
												);
											const source = livePathRef.current ?? opened.path;
											await moveBlock(
												vaultHost,
												source,
												paneCanvas,
												blockId,
												position,
											);
											await show(source, vaultName);
											setCanvasRefresh((count) => count + 1);
										}}
										onMoveToNote={
											opened?.editable && opened.note && writable
												? async (blockId) => {
														if (!(await settle()))
															throw new Error(
																`Save the note before moving a block: ${autosave.failureReason() ?? "the save did not finish"}.`,
															);
														const destination =
															livePathRef.current ?? opened.path;
														await moveBlock(
															vaultHost,
															paneCanvas,
															destination,
															blockId,
															{ after: null },
														);
														await show(destination, vaultName);
														setCanvasRefresh((count) => count + 1);
													}
												: undefined
										}
									/>
								</ResizablePanel>
							</>
						)}
					</ResizablePanelGroup>
				</AppShell>
			</div>
		</TooltipProvider>
	);
}
