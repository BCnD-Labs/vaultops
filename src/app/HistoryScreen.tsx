import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedInput } from "@/components/ui/segmented";
import type { Host, VcsLogEntry, VcsStatus } from "../host/host";
import { BranchMenu } from "./BranchMenu";
import { HistoryGraph } from "./HistoryGraph";
import { MergeReview } from "./MergeReview";

const MODE_KEY = "vaultops:history-view";
type Mode = "list" | "graph";
const loadMode = (): Mode => {
	try {
		return localStorage.getItem(MODE_KEY) === "graph" ? "graph" : "list";
	} catch {
		return "list";
	}
};

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
 * current branch, newest first, a page at a time. The Graph view shows every
 * branch with its lanes instead.
 */
export function HistoryScreen({
	host,
	onOpenSettings,
	beforeSwitch,
	onSwitched,
}: {
	host: Pick<Host, "vcs" | "writeTextAtomic" | "makeFolder" | "kindOf">;
	/** History is off: open Settings → History to turn it on. */
	onOpenSettings?: () => void;
	/** Save open notes to disk before the branch changes; false when one couldn't be. */
	beforeSwitch?: () => Promise<boolean>;
	/** The vault's files changed (another branch): read the vault and open notes again. */
	onSwitched?: () => void;
}) {
	const [status, setStatus] = useState<VcsStatus | null>(null);
	const [entries, setEntries] = useState<VcsLogEntry[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [mode, setMode] = useState<Mode>(loadMode);
	/** The branch being merged in, while its review is open. */
	const [merging, setMerging] = useState<string | null>(null);

	const load = useCallback(
		async (skip: number) => {
			setLoading(true);
			setError(null);
			try {
				const s = await host.vcs.status();
				setStatus(s);
				if (!s.enabled) return;
				// The graph shows every branch; the list, the current one.
				const page = await host.vcs.log({
					skip,
					limit: HISTORY_PAGE,
					allBranches: mode === "graph",
				});
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
		[host, mode],
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
					<div className="history-toolbar">
						<p className="history-meta">
							<BranchMenu
								host={host}
								current={status.branch}
								beforeSwitch={beforeSwitch}
								onChanged={(switched) => {
									void load(0);
									if (switched) onSwitched?.();
								}}
								onMerge={setMerging}
							/>{" "}
							{plural(entries.length, "save point")}
							{hasMore ? " shown" : ""}
						</p>
						<SegmentedInput
							label="History view"
							clearable={false}
							options={[
								{ value: "list", label: "List" },
								{ value: "graph", label: "Graph" },
							]}
							value={mode}
							onChange={(next) => {
								const m: Mode = next === "graph" ? "graph" : "list";
								setMode(m);
								try {
									localStorage.setItem(MODE_KEY, m);
								} catch {
									/* Storage is optional. */
								}
							}}
						/>
					</div>
					{merging && (
						<MergeReview
							host={host}
							branch={merging}
							current={status.branch}
							beforeStart={beforeSwitch}
							onDone={(filesChanged) => {
								setMerging(null);
								void load(0);
								if (filesChanged) onSwitched?.();
							}}
						/>
					)}
					{!merging && status.merging && (
						<p role="alert" className="notice">
							A merge was left unfinished.{" "}
							<Button
								variant="outline"
								size="sm"
								onClick={() =>
									void host.vcs.mergeAbort().then(() => {
										void load(0);
										onSwitched?.();
									})
								}
							>
								Cancel it
							</Button>
						</p>
					)}
					{mode === "graph" && <HistoryGraph entries={entries} />}
					<ol className="history-list" hidden={mode === "graph"}>
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
