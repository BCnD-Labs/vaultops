import { useCallback, useEffect, useRef, useState } from "react";
import { trashNote } from "../core/notes/trash";
import { DebugPanel } from "../debug/DebugPanel";
import { getLogger } from "../debug/index";
import { NoteEditor } from "../editor/NoteEditor";
import { type OpenedNote, openNote } from "../editor/note-io";
import { createQuitGuard } from "../editor/quit";
import { SaveStatus } from "../editor/SaveStatus";
import { saveAsCopy } from "../editor/save-draft";
import { type SavedInfo, useAutosave } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { browserLastNote, pickInitialNote } from "./last-note";
import {
	chooseAndLoad,
	compareRows,
	createAndLoad,
	loadVault,
	type VaultView,
} from "./session";
import "./app.css";

/** The window: notes on the left, the open note on the right. */
export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState<OpenedNote | null>(null);
	const [livePath, setLivePath] = useState<string | null>(null);
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
	const [appInfo, setAppInfo] = useState({ name: "vaultops", version: "?" });
	const [confirmTrash, setConfirmTrash] = useState(false);
	const vaultName = view?.name ?? null;

	const onSaved = useCallback((info: SavedInfo) => {
		setNotice(info.notice ?? null);
		livePathRef.current = info.path;
		setLivePath(info.path);
		if (!info.titleChanged) return;
		setView((v) =>
			v
				? {
						...v,
						notes: v.notes
							.map((n) =>
								n.path === info.oldPath
									? { ...n, path: info.path, title: info.title }
									: n,
							)
							.sort(compareRows),
					}
				: v,
		);
	}, []);

	const autosave = useAutosave(host, opened, onSaved);
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
		async (path: string, vault: string | null) => {
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
				setConfirmTrash(false);
				setOpened(next);
				if (vault) lastNotes.current.set(vault, path);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host],
	);

	const open = useCallback(
		async (path: string) => {
			if (!(await settle())) return;
			await show(path, vaultName);
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
				setShowDebug((v) => !v);
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
			.onCloseRequested(createQuitGuard(() => flushRef.current()))
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
		if (!view || autoOpened.current || opened || view.status === "none") return;
		autoOpened.current = true;
		const paths = view.notes.map((n) => n.path);
		const pick = pickInitialNote(
			paths,
			view.name ? lastNotes.current.get(view.name) : null,
		);
		if (pick) void show(pick, view.name);
	}, [view, opened, show]);

	useEffect(() => {
		if (opened && focusTitle.current) {
			focusTitle.current = false;
			titleInput.current?.focus();
			titleInput.current?.select();
		}
	}, [opened]);

	const startNote = async () => {
		if (!view || !(await settle())) return;
		setBusy(true);
		try {
			const made = await createAndLoad(host, view);
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
			await trashNote(host, path);
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
		const result = await saveAsCopy(host, { ...opened, path }, draft);
		if (!result.ok) {
			setError(`The copy was not saved: ${result.message}`);
			return;
		}
		autosave.discard();
		setView(await loadVault(host));
		await show(result.path, vaultName);
	};

	const editor = opened && (
		<>
			<input
				ref={titleInput}
				className="title-field"
				aria-label="Title"
				value={title}
				readOnly={!opened.editable}
				onChange={(event) => {
					const next = event.target.value;
					titleRef.current = next;
					setTitle(next);
					if (docRef.current) {
						autosave.change({ doc: docRef.current, title: next });
					}
				}}
			/>
			<div className="status-line">
				{opened.editable && (
					<SaveStatus
						state={autosave.state}
						onRetry={autosave.retry}
						onLoadDisk={loadDisk}
						onSaveCopy={saveCopy}
					/>
				)}{" "}
				{confirmTrash ? (
					<span>
						Move this note to the trash?{" "}
						<button type="button" onClick={moveToTrash}>
							Move to trash
						</button>{" "}
						<button type="button" onClick={() => setConfirmTrash(false)}>
							Cancel
						</button>
					</span>
				) : (
					<button
						type="button"
						className="link-button"
						disabled={busy}
						onClick={() => setConfirmTrash(true)}
					>
						Move to trash
					</button>
				)}
			</div>
			{notice && (
				<p role="status" className="notice">
					{notice}
				</p>
			)}
			<NoteEditor
				key={opened.path}
				doc={opened.doc}
				editable={opened.editable}
				onChange={(doc) => {
					docRef.current = doc;
					getLogger().count("edits");
					autosave.change({ doc, title: titleRef.current });
				}}
			/>
		</>
	);

	return (
		<div className="app">
			{showDebug && (
				<DebugPanel
					logger={getLogger()}
					app={appInfo}
					onClose={() => setShowDebug(false)}
				/>
			)}
			<aside className="sidebar">
				<h1>{view?.name ?? "VaultOps"}</h1>
				<div className="sidebar-actions">
					<button
						type="button"
						disabled={busy || !view?.writable}
						onClick={startNote}
					>
						New note
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={async () => {
							if (!(await settle())) return;
							setOpened(null);
							run(() => chooseAndLoad(host));
						}}
					>
						Choose vault…
					</button>
				</div>
				{view?.messages.map((m) => (
					<p key={m} className="notice">
						{m}
					</p>
				))}
				{view && view.status !== "none" && (
					<ul className="note-list">
						{view.notes.map((n) => (
							<li key={n.path} title={n.path}>
								<button
									type="button"
									aria-current={n.path === livePath}
									onClick={() => open(n.path)}
								>
									{n.title}
									{n.readOnly && (
										<span className="read-only-tag"> read-only</span>
									)}
								</button>
							</li>
						))}
					</ul>
				)}
				{view && view.status !== "none" && view.notes.length === 0 && (
					<p className="read-only-tag">No notes yet.</p>
				)}
			</aside>
			<main className="pane">
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
				{editor}
				{!opened && view && view.status !== "none" && (
					<p className="empty-pane">Pick a note, or start a new one.</p>
				)}
			</main>
		</div>
	);
}
