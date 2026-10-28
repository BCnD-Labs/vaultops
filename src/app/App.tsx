import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { NoteEditor } from "../editor/NoteEditor";
import { type OpenedNote, openNote, saveDoc } from "../editor/note-io";
import type { Host } from "../host/host";
import { chooseAndLoad, loadVault, newNote, type VaultView } from "./session";

/** The first real window: choose a vault, see its notes, add a note. */
export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState<OpenedNote | null>(null);
	const [saveMessage, setSaveMessage] = useState<string | null>(null);
	const latest = useRef<JSONContent | null>(null);

	const open = useCallback(
		async (path: string) => {
			try {
				const next = await openNote(host, path);
				latest.current = next.doc;
				setSaveMessage(null);
				setOpened(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[host],
	);

	// T11 replaces this button with autosave.
	const save = useCallback(async () => {
		if (!opened) return;
		const result = await saveDoc(host, opened, latest.current ?? opened.doc);
		if (result.ok) {
			setOpened({ ...opened, note: result.note });
			setSaveMessage("Saved");
		} else {
			setSaveMessage(`Not saved: ${result.message}`);
		}
	}, [host, opened]);

	const saveRef = useRef(save);
	saveRef.current = save;
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
				event.preventDefault();
				void saveRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

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
					onClick={() => {
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
						onChange={(doc) => {
							latest.current = doc;
							setSaveMessage(null);
						}}
					/>
					<button type="button" disabled={!opened.editable} onClick={save}>
						Save
					</button>{" "}
					<span role="status">{saveMessage}</span>
				</section>
			)}
		</main>
	);
}
