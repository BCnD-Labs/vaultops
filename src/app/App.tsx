import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	createFolder,
	movedPath,
	moveFolder,
	renameFolder,
	within,
} from "../core/notes/folders";
import { headerProps, type Props as NoteProps } from "../core/notes/properties";
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
import { type SavedInfo, useAutosave } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { readOnlyHost } from "../host/read-only-host";
import { AppShell } from "./AppShell";
import { browserLastNote, pickInitialNote } from "./last-note";
import { NotePane } from "./NotePane";
import { NoteTools } from "./NoteTools";
import type { TreeActions } from "./NoteTree";
import { Sidebar } from "./Sidebar";
import {
	chooseAndLoad,
	compareRows,
	createAndLoad,
	loadVault,
	type VaultView,
} from "./session";
import { type Selection, selectionForPath } from "./sidebar-selection";
import "../ui/theme.css";
import "./app.css";

/** The window keeps note and save state outside its collapsible sidebars. */
export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [screen, setScreen] = useState<"note" | "trash" | "health">("note");
	const [trash, setTrash] = useState<TrashedNote[]>([]);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	const [confirmEditing, setConfirmEditing] = useState(false);
	const [screenNotice, setScreenNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [openedNote, setOpened] = useState<OpenedNote | null>(null);
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
	const tree = useMemo(
		() => (view ? buildTree(view.folders, view.notes) : []),
		[view],
	);
	const [title, setTitle] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const docRef = useRef(opened?.doc ?? null);
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

	const onSaved = useCallback((info: SavedInfo) => {
		setNotice(info.notice ?? null);
		livePathRef.current = info.path;
		setLivePath(info.path);
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
		async (path: string, vault: string | null, follow = true) => {
			try {
				setError(null);
				const started = performance.now();
				const next = await openNote(host, path);
				getLogger().log({
					kind: "perf",
					name: "note-open",
					ms: Math.round(performance.now() - started),
					ok: true,
					detail: { editable: next.editable },
				});
				docRef.current = next.doc;
				const text =
					typeof next.note?.header.title === "string"
						? next.note.header.title
						: path;
				titleRef.current = text;
				setTitle(text);
				setNotice(next.notice ?? null);
				livePathRef.current = path;
				setLivePath(path);
				if (follow) setSelection(selectionForPath(path));
				const loaded = headerProps(next.note?.header);
				propsRef.current = loaded;
				setProps(loaded);
				setConfirmTrash(false);
				setConfirmEditing(false);
				setScreen("note");
				setOpened(next);
				if (vault) lastNotes.current.set(vault, path);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host],
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
		const paths = view.notes.map((n) => n.path);
		const pick = pickInitialNote(
			paths,
			view.name ? lastNotes.current.get(view.name) : null,
		);
		if (pick) void show(pick, view.name);
	}, [view, opened, show, screen]);

	useEffect(() => {
		if (opened && focusTitle.current) {
			focusTitle.current = false;
			titleInput.current?.focus();
			titleInput.current?.select();
		}
	}, [opened]);

	const navigate = async (next: "trash" | "health" | "note") => {
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

	const startNote = async (folder = "") => {
		if (!view || !(await settle())) return;
		setBusy(true);
		try {
			const made = await createAndLoad(vaultHost, view, folder);
			setView(made.view);
			if (made.path) {
				focusTitle.current = true;
				await show(made.path, made.view.name);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

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
			autosave.change(draftOf(docRef.current, titleRef.current));
	};

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
					path={livePath}
					title={opened ? title : null}
					tools={
						<NoteTools
							key={opened?.path}
							hasNote={screen === "note" && !!opened}
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
					<NotePane
						view={view}
						screen={screen}
						error={error}
						busy={busy}
						writable={writable}
						screenNotice={screenNotice}
						trash={trash}
						confirmDelete={confirmDelete}
						opened={opened}
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
								autosave.change(draftOf(docRef.current, next));
						}}
						onDocChange={(doc) => {
							docRef.current = doc;
							getLogger().count("edits");
							autosave.change(draftOf(doc, titleRef.current));
						}}
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
				</AppShell>
			</div>
		</TooltipProvider>
	);
}
