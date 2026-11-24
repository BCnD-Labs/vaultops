import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Host, VcsLogEntry, VcsStatus } from "../host/host";

/** Save points per page. */
export const HISTORY_PAGE = 50;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const when = (iso: string) => {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			});
};

/**
 * The vault's history: unsaved changes on top, then every save point on the
 * current branch, newest first, a page at a time.
 */
export function HistoryScreen({
	host,
	onOpenSettings,
}: {
	host: Pick<Host, "vcs">;
	/** History is off: open Settings → History to turn it on. */
	onOpenSettings?: () => void;
}) {
	const [status, setStatus] = useState<VcsStatus | null>(null);
	const [entries, setEntries] = useState<VcsLogEntry[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	const load = useCallback(
		async (skip: number) => {
			setLoading(true);
			setError(null);
			try {
				const s = await host.vcs.status();
				setStatus(s);
				if (!s.enabled) return;
				const page = await host.vcs.log({ skip, limit: HISTORY_PAGE });
				setEntries((old) =>
					skip === 0 ? page.entries : [...old, ...page.entries],
				);
				setHasMore(page.hasMore);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setLoading(false);
			}
		},
		[host],
	);

	useEffect(() => {
		void load(0);
	}, [load]);

	return (
		<section className="history-screen" aria-label="History">
			<h2>History</h2>
			{error && (
				<p role="alert" className="notice">
					{error}
				</p>
			)}
			{status && !status.enabled && (
				<p className="settings-note">
					History is off for this vault.{" "}
					{onOpenSettings && (
						<Button variant="link" size="sm" onClick={onOpenSettings}>
							Turn it on in Settings
						</Button>
					)}
				</p>
			)}
			{status?.enabled && (
				<>
					<p className="history-meta">
						Branch {status.branch ?? "(none)"} ·{" "}
						{plural(entries.length, "save point")}
						{hasMore ? " shown" : ""}
					</p>
					<ol className="history-list">
						<li
							className="history-row history-unsaved"
							aria-label="Unsaved changes"
						>
							<span className="history-dot" aria-hidden="true" />
							<span className="history-subject">
								{status.changes.length === 0
									? "No unsaved changes"
									: `Unsaved changes (${plural(status.changes.length, "file")})`}
							</span>
						</li>
						{entries.map((entry) => (
							<li key={entry.id} className="history-row">
								<span className="history-dot" aria-hidden="true" />
								<span className="history-subject">{entry.subject}</span>
								<span className="history-detail">
									<time dateTime={entry.date}>{when(entry.date)}</time> ·{" "}
									{entry.author} · {plural(entry.filesChanged, "file")}
								</span>
								{entry.body && <p className="history-body">{entry.body}</p>}
							</li>
						))}
					</ol>
					{hasMore && (
						<Button
							variant="outline"
							size="sm"
							disabled={loading}
							onClick={() => void load(entries.length)}
						>
							{loading ? "Loading…" : "Load older save points"}
						</Button>
					)}
				</>
			)}
			{loading && !status && <p className="settings-note">Loading history…</p>}
		</section>
	);
}
