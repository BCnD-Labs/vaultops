import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LinkRef } from "../core/links/links";
import {
	type Block,
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
	type NoteHeader,
} from "../core/note-format";
import type { Placement } from "../core/notes/block-move";
import type { CanvasTemplate } from "../core/notes/canvas-templates";
import { duplicateNote } from "../core/notes/duplicate";
import {
	createFolder,
	movedPath,
	moveFolder,
	renameFolder,
	within,
} from "../core/notes/folders";
import {
	type Answers,
	buildFormNote,
	type FormConfig,
} from "../core/notes/forms";
import { outlineOf } from "../core/notes/outline";
import { prunePins, savePin } from "../core/notes/pins";
import { headerProps, type PropertyValue } from "../core/notes/properties";
import { type MoveResult, moveNote, renameNote } from "../core/notes/rename";
import { createNote, loadNote } from "../core/notes/repository";
import { noteTitleFor, syncRowTitles } from "../core/notes/row-notes";
import { rememberDestination } from "../core/notes/send-to";
import {
	planTagRename,
	renameTagInProps,
	renameTagOnDisk,
} from "../core/notes/tag-rename";
import { knownTags } from "../core/notes/tag-suggest";
import type { fillTemplate } from "../core/notes/template-prompts";
import {
	loadTemplateRules,
	resolveFolderTemplate,
	trackTemplateRuleMove,
} from "../core/notes/template-rules";
import {
	listTemplates,
	readTemplate,
	type TemplateEntry,
} from "../core/notes/templates";
import {
	deleteForever,
	listTrash,
	restoreNote,
	type TrashedNote,
	trashFolder,
	trashNote,
} from "../core/notes/trash";
import { buildTree } from "../core/notes/tree";
import { keyOfDate } from "../core/planner/dates";
import {
	listCards,
	loadTypes,
	type ResourceCard,
	type ResourceType,
} from "../core/resources/resources";
import { parseMaintainer } from "../core/session/maintainer";
import { joinRecovery } from "../core/session/recovery";
import {
	blankTemplate,
	fieldPrompts,
	findTypeTemplate,
	typedHeader,
} from "../core/types/new-note";
import { sameViewFields } from "../core/views/row";
import { NEW_TAB, type PaneId } from "../core/workspace";
import { DebugPanel } from "../debug/DebugPanel";
import { getLogger } from "../debug/index";
import { MaintainerPanel } from "../debug/MaintainerPanel";
import { blocksToDoc, checkBlocks } from "../editor/doc-blocks";
import { type TemplateCursor, templateCaret } from "../editor/insert-blocks";
import { selectedSendBlock } from "../editor/NoteEditor";
import type { RowNoteActions } from "../editor/note-link";
import { createQuitGuard } from "../editor/quit";
import { saveAsCopy } from "../editor/save-draft";
import type { SavedInfo } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { readOnlyHost } from "../host/read-only-host";
import { notify } from "../ui/notify";
import { AppearanceProvider } from "./AppearanceContext";
import { AppShell } from "./AppShell";
import { CanvasPane } from "./CanvasPane";
import { CanvasTemplateDialog } from "./CanvasTemplateDialog";
import { lastCanvas } from "./canvas-layout";
import { COMMANDS, type CommandContext, filterCommands } from "./commands";
import { FloatingNotes } from "./FloatingNotes";
import { FolderPickerDialog, VAULT_ROOT } from "./FolderPickerDialog";
import { linkedFrom } from "./LinkedFromPanel";
import { browserLastNote, pickInitialNote } from "./last-note";
import { buildLinkSource, linkTargets } from "./link-source";
import type { LiveDocuments, UndoResult } from "./live-documents";
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
import { useReviewState } from "./review/useReviewState";
import { createRowNote } from "./row-note";
import { useSavedWorkspaces } from "./SavedWorkspaces";
import { ScreenPane } from "./ScreenPane";
import { SendToBlock, SendToDialog } from "./SendToDialog";
import { SettingsDialog } from "./SettingsScreen";
import { Sidebar } from "./Sidebar";
import {
	compareRows,
	createAndLoad,
	createCanvasAndLoad,
	loadVault,
	type Screen,
	type VaultView,
} from "./session";
import { newNoteFolder, templateFormats, templateWeekStart } from "./settings";
import { commandMatches } from "./shortcuts";
import { type Selection, selectionForPath } from "./sidebar-selection";
import { VaultTags } from "./TagChips";
import { TemplateManager } from "./TemplateManager";
import { useTemplatePrompt } from "./TemplatePromptDialog";
import { browserTabs, pruneTabs } from "./tabs";
import { useFeatures } from "./useFeature";
import { UNSAVED_NOTE_MESSAGE } from "./useNoteSession";
import {
	type BlockMoveResult,
	type PaneView,
	useWorkspaceHost,
} from "./useWorkspaceHost";
import { createViewRows } from "./view-rows";
import { type PaneDoc, WorkspacePanes } from "./WorkspacePanes";
import "../ui/theme.css";
import "./app.css";

const other = (id: PaneId): PaneId => (id === "left" ? "right" : "left");

export function App({ host }: { host: Host }) {
	// Features switched off in Settings > Features: only the ways to create or
	// open them are hidden. Existing canvases, database blocks and math still open.
	const features = useFeatures();
	const templatesOn = features.isEnabled("templates");
	const resourcesOn = features.isEnabled("resources");
	const canvasOn = features.isEnabled("canvas");
	const plannerOn = features.isEnabled("planner");
	const [view, setView] = useState<VaultView | null>(null);
	const [reading, setReading] = useState(false);
	const [settingsRequest, setSettingsRequest] = useState<object>();
	const [templatesRequest, setTemplatesRequest] = useState<object>();
	// The canvas template picker, with where the new canvas will go.
	const [canvasPicker, setCanvasPicker] = useState<{
		folder: string;
		pane?: PaneId;
	} | null>(null);
	const templatePrompt = useTemplatePrompt();
	const [resourcesRequest, setResourcesRequest] = useState<object>();
	// The card a link asked to see; the manager shows it when it opens.
	const [focusResource, setFocusResource] = useState<string | null>(null);
	// The block just moved, with the way to take it back.
	const [moveNotice, setMoveNotice] = useState<{
		text: string;
		undo?: () => Promise<UndoResult>;
		dismiss?: () => void;
		block?: true;
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
	const [screen, setScreen] = useState<Screen>("note");
	const journalOpening = useRef(false);
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
	const focusBody = useRef<
		boolean | { path: string; cursor: TemplateCursor | null }
	>(false);
	// One new note or canvas at a time: a double click makes one, not two.
	const creating = useRef(false);
	const lastNotes = useRef(browserLastNote());
	const autoOpened = useRef(false);
	const [showDebug, setShowDebug] = useState(false);
	const [maintainer, setMaintainer] = useState(false);
	const maintainerRef = useRef(false);
	const openTemplatesRef = useRef<(() => void) | undefined>(undefined);
	const openResourcesRef = useRef<(() => void) | undefined>(undefined);
	const [showMaintainer, setShowMaintainer] = useState(false);
	const [appInfo, setAppInfo] = useState({ name: "vaultops", version: "?" });
	const [treeNotice, setTreeNotice] = useState<string | null>(null);
	const [selection, setSelection] = useState<Selection>({ kind: "all" });
	const [vaultGeneration, nextVaultGeneration] = useState(0);
	const vaultName = view?.name ?? null;
	// The latest view, updated at once so a command that follows a change (make a
	// note, then open it) already sees the new rows.
	const viewRef = useRef(view);
	viewRef.current = view;
	// Live views read these rows; typing in a note does not wake them.
	const [viewRows] = useState(createViewRows);
	useEffect(() => viewRows.sync(view?.notes ?? []), [viewRows, view?.notes]);
	const vaultTags = useMemo(() => knownTags(view?.notes ?? []), [view?.notes]);
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
	const followHistory = useCallback((from: string, to: string) => {
		setNavState((state) => ({
			...state,
			history: state.history.entries.reduce(
				(history, path) =>
					renameEntry(history, path, movedPath(path, from, to)),
				state.history,
			),
		}));
	}, []);
	const refreshAfterCreate = useRef<() => void>(() => {});
	const onSaved = useCallback(
		(info: SavedInfo) => {
			if (info.created) {
				refreshAfterCreate.current();
				return;
			}
			if (info.oldPath !== info.path) followHistory(info.oldPath, info.path);
			changeView((v) => {
				const row = v?.notes.find((n) => n.path === info.oldPath);
				if (!v || !row) return v;
				const sameTags = row.tags.join("\n") === info.tags.join("\n");
				const sameCards =
					info.flashcards === undefined ||
					(row.flashcards ?? []).join("\n") === info.flashcards.join("\n");
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
					row.icon === info.icon &&
					sameBody &&
					sameCards &&
					(info.fields === undefined || sameViewFields(row, info)) &&
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
										icon: info.icon,
										...(info.text === undefined
											? {}
											: { text: info.text, links: info.links ?? [] }),
										...(info.headings === undefined
											? {}
											: { headings: info.headings }),
										...(info.properties === undefined
											? {}
											: { properties: info.properties }),
										...(info.flashcards === undefined
											? {}
											: { flashcards: info.flashcards }),
										...(info.fields === undefined
											? {}
											: {
													fields: info.fields,
													type: info.type,
													cover: info.cover,
												}),
										updatedAt: info.updatedAt,
									}
								: n,
						)
						.sort(compareRows),
				};
			});
		},
		[changeView, followHistory],
	);

	// The workspace owns the tabs, note sessions and draft recovery.
	const ws = useWorkspaceHost({
		host,
		vaultGeneration,
		notes: view?.notes,
		writable,
		isCanvas,
		onSaved,
		onCanvasTitleSaved: (from, to, title) => {
			if (from !== to) {
				if (vaultName && lastCanvas(vaultName) === from) selectCanvas(to);
				followHistory(from, to);
			}
			changeView(
				(v) =>
					v && {
						...v,
						report: v.report.map((e) =>
							e.path === from ? { ...e, path: to } : e,
						),
						notes: v.notes
							.map((n) => (n.path === from ? { ...n, path: to, title } : n))
							.sort(compareRows),
					},
			);
		},
		onUnsaved: setError,
		onError: setError,
	});
	const review = useReviewState(
		vaultHost,
		features.isEnabled("review") ? ws.documents : null,
		view?.notes,
		writable,
		screen === "review",
	);
	const wsRef = useRef(ws);
	wsRef.current = ws;
	const scan = useCallback(
		async (registry: LiveDocuments) => {
			const next = await loadVault(host);
			const applied = await registry.refresh(next.notes, (from, to) => {
				wsRef.current.rename(from, to);
				followHistory(from, to);
			});
			if (applied) changeView(next);
		},
		[host, changeView, followHistory],
	);
	const refreshVault = useCallback(
		() => wsRef.current.withDocuments(scan),
		[scan],
	);
	refreshAfterCreate.current = () =>
		void refreshVault()?.catch((error: unknown) => setError(String(error)));
	useEffect(() => {
		const onFocus = () => {
			if (viewRef.current?.name)
				void refreshVault()?.catch((error: unknown) => setError(String(error)));
		};
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [refreshVault]);
	const { left, right } = ws.panes;
	const focusedPane = ws.panes[ws.focused] ?? left;
	// The focused pane's note, for the tools, status bar and breadcrumb.
	const session = ws.focusedSession;
	const [sendRequest, setSendRequest] = useState<{
		noteId: string;
		block: Block;
		generation: number;
	}>();
	const sendEnabled = writable && features.isEnabled("send-to");
	const openSend = (noteId: string, block: Block) =>
		setSendRequest({ noteId, block, generation: vaultGeneration });
	const caretSend = (origin: EventTarget | null) => {
		if (!sendEnabled || !(origin instanceof Element)) return;
		const field = origin.closest<HTMLElement & { editor?: Editor }>(".tiptap");
		const editor = field?.editor;
		const noteId =
			field?.closest<HTMLElement>("[data-undo-note]")?.dataset.undoNote;
		const block =
			editor?.isEditable && !editor.isDestroyed
				? selectedSendBlock(editor)
				: undefined;
		if (noteId && block?.id && block.type !== "listItem")
			return () => openSend(noteId, block);
	};
	const caretSendRef = useRef(caretSend);
	caretSendRef.current = caretSend;
	const sendSource =
		sendEnabled && sendRequest?.generation === vaultGeneration
			? view?.notes.find(
					(row) => row.id === sendRequest.noteId && !row.readOnly,
				)
			: undefined;
	const recentKey = `vaultops.send-to.${vaultName}`;
	const today = keyOfDate(new Date());
	let recent: string[] = [];
	if (sendSource) {
		try {
			const saved: unknown = JSON.parse(
				localStorage.getItem(recentKey) ?? "[]",
			);
			if (Array.isArray(saved))
				recent = saved.filter((path) => typeof path === "string");
		} catch {
			/* Storage is optional. */
		}
	}

	const anyShown = [left, right].some(
		(pane) => pane && (pane.kind === "note" || pane.kind === "canvas"),
	);

	// Bring back this vault's tabs (for notes that still exist) when it opens.
	// biome-ignore lint/correctness/useExhaustiveDependencies: Vaults can have the same folder name.
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
	}, [vaultName, vaultGeneration]);
	// Remember the tabs. Runs when the workspace changes (a vault change makes a
	// new workspace first), so one vault's tabs are never saved under another.
	const workspace = ws.workspace;
	const savedWorkspaces = useSavedWorkspaces(
		vaultName,
		vaultGeneration,
		ws,
		async (saved) => {
			if (await ws.restoreSaved(saved, notify, screen === "journal"))
				setScreen("note");
		},
	);
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
			if (screen === "journal" && !(await wsRef.current.settleAll()))
				return false;
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
		[isCanvas, screen, selectCanvas, vaultName],
	);

	// Put a pane's note back on screen from the disk (after "load the disk
	// version", or a repair).
	const reloadPane = useCallback(
		async (pane: PaneView) => {
			const path = pane.session.livePathRef.current;
			if (path === null) return;
			try {
				await pane.session.reload(host, path);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host],
	);

	// What the manager shortcuts open: the same as the palette commands, and
	// only once a vault is open.
	useEffect(() => {
		const ready = view !== null && view.status !== "none";
		openTemplatesRef.current =
			ready && templatesOn ? () => setTemplatesRequest({}) : undefined;
		openResourcesRef.current =
			ready && resourcesOn
				? () => {
						setFocusResource(null);
						setResourcesRequest({});
					}
				: undefined;
	});

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (commandMatches(event, "send-block")) {
				const run = caretSendRef.current(event.target);
				if (run) {
					event.preventDefault();
					run();
					return;
				}
			}
			if (commandMatches(event, "debug")) {
				event.preventDefault();
				if (maintainerRef.current) setShowDebug((v) => !v);
				return;
			}
			if (commandMatches(event, "save")) {
				event.preventDefault();
				void wsRef.current.flushAll();
				return;
			}
			// Unbound by default: an empty binding never matches.
			if (commandMatches(event, "open-templates")) {
				event.preventDefault();
				openTemplatesRef.current?.();
				return;
			}
			if (commandMatches(event, "open-resources")) {
				event.preventDefault();
				openResourcesRef.current?.();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	// Saving on quit: the window waits for every draft to save, and stays
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
		const target = focusBody.current;
		if (target !== true && target.path !== session.livePath) return;
		// The editor mounts just after the note is shown: try for a moment.
		// The flag stays up until it worked, so a re-render can't lose it.
		let tries = 0;
		const timer = setInterval(() => {
			const field = document.querySelector<HTMLElement>(
				'.note-editor [contenteditable="true"]',
			);
			const editor = session.binding?.editorSlot?.editor;
			if (target !== true && editor?.isEditable) {
				const { state, view } = editor;
				view.dispatch(
					state.tr
						.setSelection(
							templateCaret(state.doc, target.cursor, state.doc.content.size),
						)
						.scrollIntoView(),
				);
				view.focus();
			} else if (target === true) field?.focus();
			if ((target === true ? field : editor?.isEditable) || ++tries >= 20) {
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

	const navigate = async (next: Screen | "settings") => {
		// Settings opens alongside the workspace.
		if (next === "settings") {
			setSettingsRequest({});
			return;
		}
		if (!(await ws.settleAll())) return;
		setBusy(true);
		try {
			if (next === "trash") setTrash(await listTrash(host));
			if (next === "journal") journalOpening.current = true;
			if (next === "health" || next === "review" || next === "journal")
				await refreshVault();
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
				screen !== "journal" &&
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
			if (next === "journal") journalOpening.current = false;
			setBusy(false);
		}
	};

	// Notes written by the planner screen (see `navigate`).
	const plannerTouched = useRef(new Set<string>());
	const plannerChanged = async (paths: string[]) => {
		for (const path of paths) plannerTouched.current.add(path);
		await refreshVault();
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
		if (!view || creating.current || templatePrompt.dialog) return;
		creating.current = true;
		let template:
			| { note: Awaited<ReturnType<typeof readTemplate>>; name: string }
			| undefined;
		try {
			if (!(await ws.settleAll())) return;
			setBusy(true);
			try {
				const path = resolveFolderTemplate(
					folder,
					await loadTemplateRules(vaultHost),
				);
				if (path) {
					const note = await readTemplate(vaultHost, path);
					if (!checkBlocks(note.blocks).ok)
						throw new Error("Unsupported template blocks.");
					template = {
						note,
						name: path.slice(path.lastIndexOf("/") + 1, -".vnote".length),
					};
				}
			} catch {
				notify("The folder template could not be used. Creating a blank note.");
			}
			if (!template) {
				const made = await createAndLoad(vaultHost, view, folder, noteTitle);
				changeView(made.view);
				if (made.path) {
					focusTitle.current = noteTitle === "Untitled";
					focusBody.current = noteTitle !== "Untitled";
					await open(made.path, { pane });
				}
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			creating.current = false;
			setBusy(false);
		}
		if (template) {
			const title = noteTitle === "Untitled" ? template.name : noteTitle;
			templatePrompt.ask(template.note, title, {
				name: template.name,
				onFill: (filled) =>
					void createFromTemplate(filled, title, folder, pane),
			});
		}
	};

	const startNoteFromTemplate = (entry: TemplateEntry) => {
		if (view && writable && entry.note && !creating.current)
			templatePrompt.ask(entry.note, entry.name, {
				name: entry.name,
				onFill: (filled) => void createFromTemplate(filled, entry.name),
			});
	};

	// "New <Type>": the type's template (or a blank note) through the same prompt
	// and create flow, with the type's fields asked in the same dialog.
	const startNoteOfType = async (type: ResourceType, inFolder?: string) => {
		if (!view || !writable || creating.current) return;
		let template: Note | null = null;
		if (type.template) {
			const entry = findTypeTemplate(
				(await listTemplates(vaultHost)).templates,
				type.template,
			);
			if (!entry?.note) {
				setError(
					`The template of ${type.name} ("${type.template}") was not found or can't be read. Pick another in the Resource manager.`,
				);
				return;
			}
			template = entry.note;
		}
		const name = `Untitled ${type.name}`;
		templatePrompt.ask(template ?? blankTemplate(), name, {
			name: `New ${type.name}`,
			fields: fieldPrompts(type),
			onFill: (filled, answers) =>
				void createFromTemplate(filled, name, undefined, undefined, {
					type,
					answers,
					folder: inFolder,
				}),
		});
	};

	const createFromTemplate = async (
		filled: ReturnType<typeof fillTemplate>,
		defaultTitle: string,
		folder = newNoteFolder(
			selection.kind === "folder" ? selection.value : "",
			view?.folders ?? [],
		),
		pane?: PaneId,
		typed?: {
			type: ResourceType;
			answers: Record<string, PropertyValue>;
			folder?: string;
		},
	) => {
		if (!view || !writable || creating.current) return;
		const { blocks, cursor } = filled;
		let { props } = filled;
		let header: NoteHeader | undefined;
		if (typed) {
			const made = typedHeader(typed.type, props, typed.answers);
			if (!made.ok) {
				setError(made.message);
				return;
			}
			header = made.header;
			props = (headerProps(header) ?? {}) as typeof props;
		}
		const title = filled.title.trim() || defaultTitle;
		const understood = checkBlocks(blocks);
		if (!understood.ok) {
			setTemplatesRequest(undefined);
			setError(
				`"${title}" has ${understood.reason}, which this version can't use for a new note.`,
			);
			return;
		}
		creating.current = true;
		try {
			if (!(await ws.settleAll())) return;
			setTemplatesRequest(undefined);
			setBusy(true);
			try {
				// A type's home folder wins; it is made the first time it is needed.
				const target = typed?.type.folder
					? typed.type.folder
					: typed
						? newNoteFolder(
								typed.folder ??
									(selection.kind === "folder" ? selection.value : ""),
								view.folders,
							)
						: folder;
				if (typed?.type.folder) await vaultHost.makeFolder(target);
				const made = await createNote(vaultHost, target, title, {
					blocks,
					...(header
						? { header }
						: Object.keys(props).length > 0 && {
								header: {
									format: NOTE_FORMAT,
									v: NOTE_FORMAT_VERSION,
									noteId: "",
									props,
								},
							}),
				});
				changeView(await loadVault(host));
				focusBody.current = { path: made.path, cursor };
				if (!(await open(made.path, { pane }))) focusBody.current = false;
				notify(
					typed
						? `Created "${title}".`
						: `Created "${title}" from the template.`,
				);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setBusy(false);
			}
		} finally {
			creating.current = false;
		}
	};

	/** A form block's Create button: a new note from its template, in its folder; the form stays where it is. */
	const createFromForm = async (request: {
		config: FormConfig;
		answers: Answers;
	}): Promise<string | null> => {
		const { config, answers } = request;
		if (!view || !writable) return "This vault is read-only.";
		if (creating.current)
			return "A note is being created. Try again in a moment.";
		creating.current = true;
		try {
			let template: Note | null = null;
			if (config.template) {
				const entry = (await listTemplates(vaultHost)).templates.find(
					(candidate) => candidate.label === config.template,
				);
				if (!entry?.note)
					return `The template "${config.template}" isn't available.`;
				template = entry.note;
			}
			const built = buildFormNote({
				template,
				fields: config.fields,
				answers,
				fallbackTitle: config.template.split("/").pop() || "Untitled",
				formats: templateFormats(),
				weekStartsOn: templateWeekStart(),
			});
			const understood = checkBlocks(built.blocks ?? []);
			if (!understood.ok)
				return `The template has ${understood.reason}, which this version can't use for a new note.`;
			const folder =
				config.folder !== "" && view.folders.includes(config.folder)
					? config.folder
					: newNoteFolder("", view.folders);
			const made = await createNote(vaultHost, folder, built.title, {
				...(built.blocks && { blocks: built.blocks }),
				...(Object.keys(built.props).length > 0 && {
					header: {
						format: NOTE_FORMAT,
						v: NOTE_FORMAT_VERSION,
						noteId: "",
						props: built.props,
					},
				}),
			});
			changeView(await loadVault(host));
			notify(
				`Created "${built.title}" in ${made.path.includes("/") ? folder : "the vault root"}.`,
			);
			return null;
		} catch (e) {
			return e instanceof Error ? e.message : String(e);
		} finally {
			creating.current = false;
		}
	};

	const startCanvas = async (
		folder = "",
		pane?: PaneId,
		template?: CanvasTemplate,
	) => {
		if (!view || creating.current) return;
		creating.current = true;
		try {
			if (!(await ws.settleAll())) return;
			setBusy(true);
			try {
				const made = await createCanvasAndLoad(
					vaultHost,
					view,
					folder,
					template,
				);
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

	// Path moves follow admitted saves. Pending edits can save at the new path.
	const changeTree = async (
		task: (host: Host) => Promise<{ notice?: string }>,
		moving = false,
	) => {
		if (!view || (!moving && !(await ws.settleAll()))) return;
		setTreeNotice(null);
		setBusy(true);
		try {
			await ws.withDocuments(async (registry, host) => {
				const treeHost = moving
					? registry.guardMoves(host, (from, to) => {
							ws.rekey(from, to);
							followHistory(from, to);
							const path = (p: string) => movedPath(p, from, to);
							const v = viewRef.current;
							if (v)
								changeView({
									...v,
									notes: v.notes.map((row) => ({
										...row,
										path: path(row.path),
									})),
									folders: v.folders.map(path),
								});
						})
					: host;
				const { notice } = await task(treeHost);
				if (notice) setTreeNotice(notice);
				await scan(registry);
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	// A tree row's path as it will be after open notes are saved: saving an open
	// note with an edited title renames its file, so actions read it late.
	const afterSave = (path: string) => {
		const id = viewRef.current?.notes.find((row) => row.path === path)?.id;
		return () =>
			viewRef.current?.notes.find((row) => id && row.id === id && !row.readOnly)
				?.path ?? path;
	};
	const afterTrash = (path: string) => {
		if ([left, right].some((pane) => pane?.active && within(pane.active, path)))
			autoOpened.current = false;
	};

	// Renames or merges a tag (and the tags below it) in every note. A note that
	// is open changes through its own session, so its autosave stays in charge;
	// the others are rewritten on disk. Nothing changes if an open note can't be
	// edited that way. Resolves with the message to show.
	const renameTag = async (
		from: string,
		to: string,
	): Promise<string | null> => {
		if (!(await ws.settleAll()))
			return "Some notes are unsaved, so nothing was renamed.";
		const plan = planTagRename(viewRef.current?.notes ?? [], from, to);
		const open = new Map<string, PaneView[]>();
		for (const pane of [left, right]) {
			const path =
				pane?.kind === "note"
					? (pane.session.livePathRef.current ?? pane.active)
					: pane?.kind === "canvas"
						? pane.active
						: null;
			if (!pane || !path || !plan.paths.includes(path)) continue;
			open.set(path, [...(open.get(path) ?? []), pane]);
		}
		for (const [path, panes] of open) {
			const pane = panes[0];
			const why =
				panes.length > 1
					? "is open in both panes"
					: pane?.kind === "canvas"
						? "is open as a canvas"
						: !pane?.session.opened?.editable || pane.session.props === null
							? "is open but can't be edited here"
							: null;
			if (why)
				return `Nothing was renamed: ${path} ${why}. Close it and try again.`;
		}
		for (const [, [pane]] of open) {
			const next =
				pane && pane.session.props
					? renameTagInProps(pane.session.props, from, to)
					: null;
			if (next) pane?.session.editProps(next);
		}
		if (!(await ws.settleAll()))
			return "An open note could not be saved, so the rename stopped.";
		const disk = plan.paths.filter((path) => !open.has(path));
		let message = "";
		await changeTree(async (host) => {
			const done = await renameTagOnDisk(host, disk, from, to);
			const count = done.changed + open.size;
			message = `${count === 1 ? "1 note" : `${count} notes`} updated.`;
			if (done.problems.length > 0)
				message += ` Not changed:\n${done.problems.join("\n")}`;
			return {};
		});
		setSelection((now) =>
			now.kind === "tag" && now.value.toLowerCase() === from.toLowerCase()
				? { kind: "tag", value: to }
				: now,
		);
		return message || null;
	};

	const byPath = useMemo(
		() => new Map(view?.notes.map((n) => [n.path, n])),
		[view?.notes],
	);
	const byId = useMemo(
		() =>
			new Map(
				view?.notes.flatMap((note) =>
					note.id ? [[note.id, note] as const] : [],
				),
			),
		[view?.notes],
	);
	const pins = prunePins(view?.pins ?? [], new Set(byId.keys()));
	const pinEnabled = features.isEnabled("pinned-notes") && !!view?.pins;
	const savingPin = useRef(false);
	const place = async (id: string, index: number | null) => {
		if (busy || !view?.writable || !pinEnabled || savingPin.current) return;
		savingPin.current = true;
		setBusy(true);
		try {
			const { pins: saved, recoveryPath } = await savePin(
				vaultHost,
				new Set(byId.keys()),
				id,
				index,
			);
			if (recoveryPath)
				setTreeNotice(`Recovered damaged pins at ${recoveryPath}.`);
			changeView((current) =>
				current && current.name === view.name
					? { ...current, pins: saved }
					: current,
			);
		} catch (error) {
			setError(String(error));
		} finally {
			savingPin.current = false;
			setBusy(false);
		}
	};
	const trackFolderMove = async (
		host: Host,
		from: string,
		result: Awaited<ReturnType<typeof renameFolder>>,
	) => {
		if (result.changed) {
			const notice = await trackTemplateRuleMove(
				host,
				"folder",
				from,
				result.path,
			);
			if (notice) notify(notice);
		}
		return result;
	};
	const treeActions: TreeActions = {
		pinAction: (path) => {
			const note = byPath.get(path);
			if (!pinEnabled || !note?.id || note.readOnly) return undefined;
			const id = note.id;
			const pinned = pins.includes(id);
			return { pinned, run: () => void place(id, pinned ? null : pins.length) };
		},
		createFolder: (parent, name) =>
			void changeTree(async () => ({
				notice: (await createFolder(vaultHost, parent, name)).notice,
			})),
		renameFolder: (path, name) =>
			void changeTree(
				async (host) =>
					trackFolderMove(host, path, await renameFolder(host, path, name)),
				true,
			),
		deleteFolder: (path) =>
			void changeTree(async () => {
				await trashFolder(vaultHost, path);
				afterTrash(path);
				return {};
			}),
		deleteNote: (path) => {
			const row = viewRef.current?.notes.find((n) => n.path === path);
			const title =
				row?.title.trim() ||
				path.slice(path.lastIndexOf("/") + 1).replace(/\.vnote$/, "");
			let trashPath: string | undefined;
			const at = afterSave(path);
			void changeTree(async () => {
				const path = at();
				trashPath = (await trashNote(vaultHost, path)).trashPath;
				afterTrash(path);
				return {};
			}).then(() => {
				if (trashPath) offerRestore(trashPath, title);
			});
		},
		move: (item, into) => {
			const at = afterSave(item.path);
			void changeTree(
				async (host) =>
					item.kind === "folder"
						? trackFolderMove(
								host,
								item.path,
								await moveFolder(host, item.path, into),
							)
						: moveNote(host, at(), into, { readOnly: item.readOnly }),
				true,
			);
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
				void shown.session.settle();
				return;
			}
			const saved = ws.renameDraft(path, title);
			if (saved) {
				void saved.then((ok) => {
					if (!ok) setError(UNSAVED_NOTE_MESSAGE);
				});
				return;
			}
			const readOnly = viewRef.current?.notes.find(
				(n) => n.path === path,
			)?.readOnly;
			const at = afterSave(path);
			void changeTree(async (host) => {
				const parsed = await loadNote(host, at());
				if (!parsed.note || parsed.problems.length)
					return {
						notice: "This note could not be read, so it was not renamed.",
					};
				return renameNote(host, at(), parsed.note, title, { readOnly });
			}, true);
		},
		// Open notes are saved first (changeTree), so the copy has the latest text.
		duplicateNote: (path) => {
			const readOnly = viewRef.current?.notes.find(
				(n) => n.path === path,
			)?.readOnly;
			const at = afterSave(path);
			void changeTree(async () => ({
				notice: (await duplicateNote(vaultHost, at(), { readOnly })).notice,
			}));
		},
		moveTo: setTreeMove,
		newNote: (folder) => void startNote(folder),
		types: resourcesOn && writable ? resources.types : undefined,
		newOfType:
			resourcesOn && writable
				? (type, folder) => void startNoteOfType(type, folder)
				: undefined,
		newCanvas: canvasOn ? (folder) => void startCanvas(folder) : undefined,
		newCanvasFromTemplate: canvasOn
			? (folder) => setCanvasPicker({ folder })
			: undefined,
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
		await changeTree(async (host) => {
			result = await moveNote(host, from, folder, {
				readOnly: !opened.editable,
			});
			return result;
		}, true);
		if (!result?.moved) return;
		const now = result.path;
		setMoveNotice({
			text: `Moved "${title}" to ${folder === "" ? VAULT_ROOT : folder}.`,
			undo: async () => {
				let back: MoveResult | undefined;
				await changeTree(async (host) => {
					back = await moveNote(host, now, fromFolder);
					return back;
				}, true);
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
		const { destination, lost, recoveryPath, undo, copy } = result.moved;
		const row = viewRef.current?.notes.find((n) => n.path === destination);
		const plural = (n: number, word: string) =>
			`${n} ${word}${n === 1 ? "" : "s"}`;
		const gave = [
			lost.connectors > 0 ? plural(lost.connectors, "connector") : "",
			lost.groups > 0 ? "its place in a group" : "",
		].filter(Boolean);
		setMoveNotice({
			block: true,
			text:
				`${copy ? "Copied" : "Moved"} a block to "${row?.title ?? destination}".` +
				(gave.length > 0
					? ` The canvas gave up ${gave.join(" and ")}; Undo brings ${gave.length === 1 && lost.groups === 0 && lost.connectors === 1 ? "it" : "them"} back${recoveryPath ? ", and a copy of the canvas is in the recovery folder" : ""}.`
					: ""),
			undo,
		});
	};

	const finishUndo = useCallback(
		(result: UndoResult) => {
			if (!result.ok) {
				if (result.dismiss)
					setMoveNotice({
						text: result.message,
						dismiss: result.dismiss,
						block: true,
					});
				else setError(result.message);
			} else if (result.move) {
				setMoveNotice((notice) => (notice?.block ? null : notice));
				void refreshVault()?.catch((error: unknown) => setError(String(error)));
			}
		},
		[refreshVault],
	);

	useEffect(() => {
		const onUndo = (event: KeyboardEvent) => {
			if (
				!(event.metaKey || event.ctrlKey) ||
				event.altKey ||
				event.shiftKey ||
				event.isComposing ||
				event.key.toLowerCase() !== "z"
			)
				return;
			const target = event.target;
			if (
				!(target instanceof Element) ||
				target.closest(
					"input, textarea, select, math-field, dialog, [role=dialog], [role=alertdialog]",
				)
			)
				return;
			const field = target.closest(
				"[contenteditable]:not([contenteditable=false])",
			);
			const note = field?.matches(".tiptap")
				? field.closest<HTMLElement>("[data-undo-note]")?.dataset.undoNote
				: undefined;
			if (field && !note) return;
			const canvas =
				target.closest<HTMLElement>("[data-undo-canvas]")?.dataset.undoCanvas;
			const workspace = wsRef.current;
			const id = note ?? canvas;
			if (id && workspace.documents?.prefersLocalUndo(id, !note)) return;
			const result = workspace.undo();
			if (!result) return;
			event.preventDefault();
			event.stopPropagation();
			void result.then(finishUndo);
		};
		window.addEventListener("keydown", onUndo, true);
		return () => window.removeEventListener("keydown", onUndo, true);
	}, [finishUndo]);

	const dropBlock = async (
		destinationId: string,
		blockId: string,
		sourceId: string,
		placement: Placement,
		copy = false,
	) => {
		const result = await wsRef.current.dropBlock(
			destinationId,
			blockId,
			sourceId,
			placement,
			copy,
		);
		if (result.ok) announceMove(result);
		else setError(result.message);
		await refreshVault()?.catch((reason: unknown) => setError(String(reason)));
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
			setResourcesRequest({});
			return;
		}
		const row = viewRef.current?.notes.find((n) => n.id === link.target);
		if (row) void open(row.path);
	};
	// A database row turned into a note: made beside the note that holds the
	// database, then the list is read again so the new note shows at once.
	const makeRowNote = useRef<RowNoteActions["create"]>(async () => ({
		ok: false,
		message: "The note was not made.",
	}));
	makeRowNote.current = async ({ from, title, content }) => {
		const source = from
			? viewRef.current?.notes.find((n) => n.id === from)
			: undefined;
		const cut = source ? source.path.lastIndexOf("/") : -1;
		const made = await createRowNote(
			vaultHost,
			source && cut !== -1 ? source.path.slice(0, cut) : "",
			title,
			content,
		);
		if (made.ok) changeView(await loadVault(host));
		return made;
	};
	// A row's Name was edited (typing has paused): the note it is gets that name,
	// the way any rename goes, so an open note keeps its unsaved edits.
	const renameRowNote = useRef<RowNoteActions["rename"]>(() => {});
	renameRowNote.current = (target, title) => {
		const row = viewRef.current?.notes.find((n) => n.id === target);
		// A note that isn't in the vault has nothing to rename; the row says so.
		if (!row || noteTitleFor(row.title) === noteTitleFor(title)) return;
		if (row.readOnly) {
			setError(
				`The note "${row.title}" is read-only, so it was not renamed. Its name in the database and the note's title now differ.`,
			);
			return;
		}
		treeActions.renameNote?.(row.path, noteTitleFor(title));
	};

	// A note's title changed (from the tree, its own title, anywhere): rows that
	// are that note take the new name, in databases open or not. Files are read
	// fresh and written whole after open notes are saved; an open one is then
	// shown again from disk. A database that can't be written is named, never
	// guessed at, and nothing is lost: the next rename tries again.
	const syncRowNames = useRef<(id: string) => Promise<void>>(async () => {});
	syncRowNames.current = async (id) => {
		const now = viewRef.current;
		const note = now?.notes.find((n) => n.id === id);
		if (!now || !note) return;
		const holders = now.notes.filter((n) => n.rowNotes?.includes(id));
		const written: string[] = [];
		const skipped: string[] = [];
		let ran = false;
		await changeTree(async () => {
			ran = true;
			for (const holder of holders) {
				if (holder.readOnly) {
					skipped.push(holder.title);
					continue;
				}
				try {
					const done = await syncRowTitles(
						vaultHost,
						holder.path,
						id,
						note.title,
					);
					if (done.status === "updated") written.push(holder.path);
					if (done.status === "skipped") skipped.push(holder.title);
				} catch {
					skipped.push(holder.title);
				}
			}
			return {};
		});
		if (!ran) {
			setError(
				`The name of "${note.title}" was not updated in the databases that list it, because open notes could not be saved first.`,
			);
			return;
		}
		for (const pane of [left, right]) {
			if (pane?.kind !== "note") continue;
			const at = pane.session.livePathRef.current ?? pane.active;
			if (at && written.includes(at)) await reloadPane(pane);
		}
		if (skipped.length > 0)
			setError(
				`The name of "${note.title}" was not updated in ${skipped.map((t) => `"${t}"`).join(", ")} (it could not be written), so the names there differ.`,
			);
	};
	const knownTitles = useRef<Map<string, string> | null>(null);
	const titleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const titleQueue = useRef(new Set<string>());
	useEffect(() => {
		if (!view) {
			knownTitles.current = null;
			return;
		}
		const next = new Map<string, string>();
		for (const n of view.notes)
			if (n.id && n.kind !== "canvas") next.set(n.id, n.title);
		const before = knownTitles.current;
		knownTitles.current = next;
		if (!before) return;
		for (const [id, title] of next) {
			const was = before.get(id);
			if (was === undefined || was === title) continue;
			if (!view.notes.some((n) => n.rowNotes?.includes(id))) continue;
			titleQueue.current.add(id);
		}
		if (titleQueue.current.size === 0) return;
		// Wait for typing in a title to pause; one pass per note.
		clearTimeout(titleTimer.current);
		titleTimer.current = setTimeout(() => {
			const ids = [...titleQueue.current];
			titleQueue.current.clear();
			void (async () => {
				for (const id of ids) await syncRowNames.current(id);
			})();
		}, 800);
	}, [view]);
	const links = useMemo(
		() =>
			Object.assign(
				buildLinkSource(
					linkTargets(view?.notes ?? [], resources.cards, resources.types),
					(link) => openLink.current(link),
					{
						create: (request) => makeRowNote.current(request),
						rename: (target, title) => renameRowNote.current(target, title),
					},
				),
				{ completionRows: view?.notes ?? [] },
			),
		[view?.notes, resources],
	);

	// The notice goes by itself; Undo itself refuses if anything changed since.
	useEffect(() => {
		if (!moveNotice || moveNotice.dismiss) return;
		const timer = setTimeout(() => setMoveNotice(null), 20000);
		return () => clearTimeout(timer);
	}, [moveNotice]);

	const noteButtons = (pane: PaneView) => {
		const path = pane.session.opened?.path;
		const context: CommandContext = {
			onNavigate: (next) => void navigate(next),
			onToggleReading: () => setReading((on) => !on),
			onOpenTemplates: templatesOn ? () => setTemplatesRequest({}) : undefined,
			pinAction: path ? treeActions.pinAction?.(path) : undefined,
			onMoveNote: pane.session.opened?.editable
				? () => setMovePicker(pane.id)
				: undefined,
		};
		const available = new Set(
			filterCommands("", context, features.state)
				.filter((command) => !command.needsWrite || (writable && !busy))
				.map((command) => command.id),
		);
		const commands = COMMANDS.filter(
			(command) =>
				!command.id.startsWith("focus-") &&
				![
					"new-folder",
					"toggle-left",
					"toggle-right",
					"new-canvas-from-template",
					"open-resources",
				].includes(command.id),
		);
		return {
			buttonCommands: commands.map(({ id, label }) => ({
				id,
				label,
				available: available.has(id),
			})),
			onButtonCommand: (id: string) => {
				if (available.has(id))
					commands.find((command) => command.id === id)?.run(context);
			},
			onButtonNewNote:
				templatesOn && writable && !busy ? startNoteFromTemplate : undefined,
		};
	};
	const openRow = useRef(open);
	openRow.current = open;
	const liveViews = useMemo(
		() => ({
			rows: viewRows,
			open: (path: string) => void openRow.current(path),
			setProps: ws.setProps,
		}),
		[viewRows, ws.setProps],
	);

	const renderNote = (pane: PaneView) => (
		<SessionNoteView
			session={pane.session}
			{...noteButtons(pane)}
			frames={
				ws.documents
					? { documents: ws.documents, rows: view?.notes ?? [] }
					: undefined
			}
			views={liveViews}
			writable={writable}
			reading={reading}
			onToggleReading={() => setReading((on) => !on)}
			busy={busy}
			titleInput={titleInputs[pane.id]}
			onLoadDisk={() => void loadDisk(pane)}
			onSaveCopy={() => void saveCopy(pane)}
			onMoveToTrash={() => void moveToTrash(pane)}
			onMoveTo={() => setMovePicker(pane.id)}
			templates={{ host: vaultHost, onManage: () => setTemplatesRequest({}) }}
			forms={{
				canCreate: writable && !!view,
				folders: view?.folders ?? [],
				templates: async () =>
					(await listTemplates(vaultHost)).templates.map(({ label }) => ({
						label,
					})),
				create: createFromForm,
			}}
			types={resourcesOn ? resources.types : undefined}
			links={links}
			locked={ws.moving}
			onDropBlock={
				pane.session.opened?.note?.header.noteId
					? dropBlock.bind(null, pane.session.opened.note.header.noteId)
					: undefined
			}
		/>
	);

	const onCanvasIconSaved = useCallback(
		(path: string, icon: string | undefined) => {
			changeView((v) =>
				v?.notes.some((row) => row.path === path && row.icon !== icon)
					? {
							...v,
							notes: v.notes.map((row) =>
								row.path === path ? { ...row, icon } : row,
							),
						}
					: v,
			);
		},
		[changeView],
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
				host={vaultHost}
				documents={ws.documents}
				links={links}
				path={path}
				canvases={(view?.notes ?? []).filter((row) => row.kind === "canvas")}
				notes={view?.notes ?? []}
				onOpenNote={(notePath) => void open(notePath, { pane: other(pane.id) })}
				writable={writable}
				focusName={focusCanvas}
				onFocusedName={() => setFocusCanvas(false)}
				onIconSaved={onCanvasIconSaved}
				onDropBlock={dropBlock}
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
								await refreshVault();
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
			calendar={doc.last && plannerOn}
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
						canvasShown || !canvasOn
							? undefined
							: () => void startCanvas(folder, pane.id)
					}
					onCreateCanvasFromTemplate={
						canvasShown || !canvasOn
							? undefined
							: () => setCanvasPicker({ folder, pane: pane.id })
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

	const sendDialog = sendRequest && sendSource && view && (
		<SendToDialog
			block={sendRequest.block}
			source={sendSource}
			notes={view.notes}
			recent={recent}
			today={today}
			close={() => setSendRequest(undefined)}
			headings={async (path) => {
				const entry = ws.documents?.subscribePassive({ path }, () => {});
				try {
					const doc = await entry?.ready;
					return outlineOf(
						blocksToDoc(
							(doc?.draft ?? doc?.base)?.blocks.filter(
								(b) => b.type === "heading" && b.parent === null,
							) ?? [],
						),
					);
				} finally {
					entry?.unsubscribe();
				}
			}}
			send={async (destination) => {
				setSendRequest(undefined);
				const result = await ws.sendBlock(
					sendRequest.noteId,
					sendRequest.block.id ?? "",
					destination,
					today,
					async () => refreshVault(),
				);
				if (!result.ok) return setError(result.message);
				announceMove(result);
				if (result.moved) {
					try {
						localStorage.setItem(
							recentKey,
							JSON.stringify(
								rememberDestination(recent, result.moved.destination),
							),
						);
					} catch {
						/* Storage is optional. */
					}
				}
			}}
		/>
	);
	const app = (
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
						writable={writable && screen !== "journal"}
						onChanged={plannerChanged}
						writeLog={async (work) => {
							if (!writable || screen === "journal" || journalOpening.current)
								throw new Error("The planner log is read-only.");
							return ws.withDocuments(work);
						}}
						onOpenNote={(path) => void open(path)}
						onOpenScreen={() => void navigate("planner")}
					>
						<AppShell
							workspaceCommands={savedWorkspaces?.commands}
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
							resources={resourcesOn ? resources.cards : undefined}
							resourceTypes={resources.types}
							onOpenResource={(noteId) => {
								setFocusResource(noteId);
								setResourcesRequest({});
							}}
							onOpenResources={
								view && view.status !== "none" && resourcesOn
									? () => {
											setFocusResource(null);
											setResourcesRequest({});
										}
									: undefined
							}
							onNewOfType={
								view && view.status !== "none" && resourcesOn
									? (type) => void startNoteOfType(type)
									: undefined
							}
							onNewCanvasFromTemplate={
								view && view.status !== "none" && canvasOn
									? () =>
											setCanvasPicker({
												folder:
													selection.kind === "folder" ? selection.value : "",
											})
									: undefined
							}
							onOpenTemplates={
								view && view.status !== "none" && templatesOn
									? () => setTemplatesRequest({})
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
							pinAction={
								screen === "note" && shownPath
									? treeActions.pinAction?.(shownPath)
									: undefined
							}
							getSendBlock={caretSend}
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
									highlights={session?.highlights}
									outline={session?.outline ?? []}
									linkedFrom={linkedFrom(
										view?.notes ?? [],
										session?.opened?.note?.header.noteId,
									)}
									noteId={session?.opened?.note?.header.noteId}
									noteTitle={session?.title}
									onOpenNote={(path) => void open(path)}
									hasNote={screen === "note" && !!session?.opened}
									props={session?.props ?? null}
									editable={!!session?.opened?.editable}
									onChange={(next) => session?.editProps(next)}
									typeApi={
										session && resourcesOn
											? {
													types: resources.types,
													typeId: session.typeId,
													onChange: session.editType,
												}
											: undefined
									}
									onOpenTag={(tag) => setSelection({ kind: "tag", value: tag })}
									onRenameTag={writable ? renameTag : undefined}
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
									pinned={
										pinEnabled
											? pins.flatMap((id) => byId.get(id) ?? [])
											: undefined
									}
									onPlacePin={place}
									treeNotice={treeNotice}
									onStartNote={(folder) =>
										void startNote(newNoteFolder(folder, view?.folders ?? []))
									}
									onStartCanvas={canvasOn ? startCanvas : undefined}
									onChooseVault={() =>
										run(async () => {
											const chosen = await ws.chooseVault(() => {
												setScreen("note");
												setSelection({ kind: "all" });
												return host.chooseVault();
											});
											if (!chosen) return null;
											const next = await loadVault(host);
											nextVaultGeneration((generation) => generation + 1);
											return next;
										})
									}
									onShowMaintainer={() => setShowMaintainer(true)}
									onNavigate={navigate}
									reviewCount={review.dueCount}
									reviewActive={screen === "review"}
									journalActive={screen === "journal"}
									onOpenSettings={() => void navigate("settings")}
									onOpenTemplates={
										templatesOn ? () => setTemplatesRequest({}) : undefined
									}
									onOpenResources={
										resourcesOn
											? () => {
													setFocusResource(null);
													setResourcesRequest({});
												}
											: undefined
									}
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
										<p
											role={moveNotice.dismiss ? "alert" : "status"}
											className="notice move-notice"
										>
											{moveNotice.text}{" "}
											{moveNotice.undo && (
												<Button
													size="sm"
													variant="outline"
													onClick={() => {
														setMoveNotice(null);
														void moveNotice.undo?.().then(finishUndo);
													}}
												>
													Undo
												</Button>
											)}{" "}
											<Button
												size="sm"
												variant="ghost"
												onClick={() => {
													moveNotice.dismiss?.();
													setMoveNotice(null);
												}}
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
											workspaceMenu={savedWorkspaces?.menu}
										/>
									)}
								</div>
							) : (
								<ScreenPane
									review={review}
									view={view}
									screen={screen}
									journal={
										ws.documents
											? {
													documents: ws.documents,
													host: vaultHost,
													links,
													onDropBlock: dropBlock,
												}
											: undefined
									}
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
						{savedWorkspaces?.dialog}
						{view && ws.documents && (
							<FloatingNotes
								key={vaultGeneration}
								documents={ws.documents}
								notes={view.notes}
								host={vaultHost}
								links={links}
								locked={ws.moving}
								onDropBlock={dropBlock}
							/>
						)}
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
									await refreshVault()?.catch((reason: unknown) =>
										setError(String(reason)),
									);
								})();
							}}
						/>
						<CanvasTemplateDialog
							open={canvasPicker !== null}
							onOpenChange={(next) => {
								if (!next) setCanvasPicker(null);
							}}
							onPick={(template) => {
								const target = canvasPicker;
								setCanvasPicker(null);
								if (target)
									void startCanvas(target.folder, target.pane, template);
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
							folders={view?.folders ?? []}
							host={vaultHost}
							notes={(view?.notes ?? []).filter((n) => n.kind !== "canvas")}
							writable={writable}
							open={!!templatesRequest}
							focusRequest={templatesRequest}
							onNewNoteFromTemplate={startNoteFromTemplate}
							onClose={() => setTemplatesRequest(undefined)}
						/>
						{templatePrompt.dialog}
						<ResourceManager
							host={vaultHost}
							writable={writable}
							open={!!resourcesRequest}
							focusRequest={resourcesRequest}
							focusId={focusResource}
							onOpenNote={(path) => {
								setResourcesRequest(undefined);
								void open(path);
							}}
							onClose={() => {
								setResourcesRequest(undefined);
								setFocusResource(null);
								void reloadResources();
							}}
						/>
						<SettingsDialog
							open={!!settingsRequest}
							focusRequest={settingsRequest}
							onOpenChange={() => setSettingsRequest(undefined)}
							host={host}
						/>
					</PlannerProvider>
				</AppearanceProvider>
			</div>
		</TooltipProvider>
	);
	return (
		<SendToBlock.Provider value={sendEnabled ? openSend : null}>
			<VaultTags.Provider value={vaultTags}>{app}</VaultTags.Provider>
			{sendDialog}
		</SendToBlock.Provider>
	);
}
