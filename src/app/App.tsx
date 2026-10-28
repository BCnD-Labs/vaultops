import { useCallback, useEffect, useRef, useState } from "react";
import { NoteEditor } from "../editor/NoteEditor";
import { type OpenedNote, openNote } from "../editor/note-io";
import { createQuitGuard } from "../editor/quit";
import { SaveStatus } from "../editor/SaveStatus";
import { useAutosave } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { chooseAndLoad, loadVault, newNote, type VaultView } from "./session";

/** The first real window: choose a vault, see its notes, add a note. */
export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState<OpenedNote | null>(null);
	const autosave = useAutosave(host, opened);
	const flushRef = useRef(autosave.flush);
	flushRef.current = autosave.flush;

	// Leaving a note (open another, change vault) first saves it; if that
	// fails the note stays open so nothing typed is lost.
	const settle = useCallback(async () => {
		if (await flushRef.current()) return true;
		setError("This note is not saved yet. Retry saving before leaving it.");
		return false;
	}, []);

	const open = useCallback(
		async (path: string) => {
			if (!(await settle())) return;
			try {
				setError(null);
				setOpened(await openNote(host, path));
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host, settle],
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
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
			if (next) setView(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, []);

	useEffect(() => {
		run(() => loadVault(host));
	}, [host, run]);

	return (
		<main
			style={{
				fontFamily: "system-ui, sans-serif",
				padding: 24,
				maxWidth: 720,
			}}
		>
			<header style={{ display: "flex", gap: 12, alignItems: "center" }}>
				<h1 style={{ margin: 0, flex: 1, fontSize: 22 }}>
					{view?.name ?? "VaultOps"}
				</h1>
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
				<button
					type="button"
					disabled={busy || !view?.writable}
					onClick={() => view && run(() => newNote(host, view))}
				>
					New note
				</button>
			</header>

			{view?.status === "none" && (
				<p>No vault is open. Choose a folder to start.</p>
			)}
			{error && <p role="alert">Something went wrong: {error}</p>}
			{view?.messages.map((m) => (
				<p key={m} style={{ color: "#8a5a00" }}>
					{m}
				</p>
			))}

			{view && view.status !== "none" && (
				<section>
					<h2 style={{ fontSize: 16 }}>Notes ({view.notes.length})</h2>
					{view.notes.length === 0 ? (
						<p>No notes yet.</p>
					) : (
						<ul>
							{view.notes.map((n) => (
								<li key={n.path} title={n.path}>
									<button type="button" onClick={() => open(n.path)}>
										{n.title}
										{n.readOnly && " (read-only)"}
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			)}

			{opened && (
				<section aria-label="Open note">
					<h2 style={{ fontSize: 16 }}>
						{typeof opened.note?.header.title === "string"
							? opened.note.header.title
							: opened.path}
					</h2>
					{opened.notice && (
						<p role="status" style={{ color: "#8a5a00" }}>
							{opened.notice}
						</p>
					)}
					<NoteEditor
						key={opened.path}
						doc={opened.doc}
						editable={opened.editable}
						onChange={autosave.change}
					/>
					{opened.editable && (
						<SaveStatus state={autosave.state} onRetry={autosave.retry} />
					)}
				</section>
			)}
		</main>
	);
}
