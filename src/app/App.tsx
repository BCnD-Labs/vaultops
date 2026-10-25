import { useCallback, useEffect, useState } from "react";
import type { Host } from "../host/host";
import { chooseAndLoad, loadVault, newNote, type VaultView } from "./session";

/** The first real window: choose a vault, see its notes, add a note. */
export function App({ host }: { host: Host }) {
	const [view, setView] = useState<VaultView | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
					onClick={() => run(() => chooseAndLoad(host))}
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
									{n.title}
									{n.readOnly && " (read-only)"}
								</li>
							))}
						</ul>
					)}
				</section>
			)}
		</main>
	);
}
