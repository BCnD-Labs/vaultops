import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	discardChange,
	groupChanges,
	lastSavePoint,
	noteChange,
} from "../core/history/changes";
import type { NoteDiff } from "../core/history/diff";
import { savePointSummary } from "../core/history/summary";
import type { Host, VcsChange, VcsStatus } from "../host/host";
import { historyChanged, useChanged } from "./change-dots";
import { NoteDiffView } from "./NoteDiffView";

type PanelHost = Pick<
	Host,
	"vcs" | "readText" | "writeTextAtomic" | "makeFolder" | "kindOf" | "move"
>;

interface Row {
	change: VcsChange;
	summary: string;
	diff: NoteDiff | null;
}

const KIND: Record<VcsChange["kind"], string> = {
	modified: "changed",
	added: "new",
	untracked: "new",
	deleted: "deleted",
	renamed: "renamed",
	conflicted: "needs merging",
};

/**
 * Everything changed since the last save point: notes with a one-line
 * summary (click for the word-by-word changes), other files and the app's
 * data. Tick what goes into the save point, or discard a change (the current
 * version is kept in the recovery folder first).
 */
export function ChangesPanel({
	host,
	flush,
	onFilesChanged,
}: {
	host: PanelHost;
	/** Save every open note to disk; false when one couldn't be saved. */
	flush: () => Promise<boolean>;
	/** Files on disk changed (a discard): read the vault and open notes again. */
	onFilesChanged: () => void;
}) {
	const changedPaths = useChanged();
	const [status, setStatus] = useState<VcsStatus | null>(null);
	const [rows, setRows] = useState<Row[]>([]);
	const [left, setLeft] = useState<Set<string>>(new Set());
	const [open, setOpen] = useState<string | null>(null);
	const [confirm, setConfirm] = useState<string | null>(null);
	const [message, setMessage] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		const s = await host.vcs.status();
		setStatus(s);
		if (!s.enabled) return;
		const head = await lastSavePoint(host);
		const notes = new Set(groupChanges(s.changes).notes.map((c) => c.path));
		setRows(
			await Promise.all(
				s.changes.map(async (change) =>
					notes.has(change.path)
						? { change, ...(await noteChange(host, change, head)) }
						: { change, summary: KIND[change.kind], diff: null },
				),
			),
		);
	}, [host]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the dots changing means something changed on disk.
	useEffect(() => {
		void load().catch((e) =>
			setNotice(e instanceof Error ? e.message : String(e)),
		);
	}, [load, changedPaths]);

	if (!status) return <p className="settings-note">Loading changes…</p>;
	if (!status.enabled)
		return (
			<p className="settings-note">
				History is off. Turn it on in Settings → History to see what changed.
			</p>
		);
	if (rows.length === 0)
		return (
			<p className="settings-note">No changes since the last save point.</p>
		);

	const included = rows.filter((r) => !left.has(r.change.path));
	const groups = groupChanges(rows.map((r) => r.change));
	const byPath = new Map(rows.map((r) => [r.change.path, r]));

	const save = async () => {
		setBusy(true);
		setNotice(null);
		try {
			if (!(await flush())) {
				setNotice(
					"A note couldn't be saved to disk, so no save point was made.",
				);
				return;
			}
			const paths = included.flatMap((r) =>
				r.change.from ? [r.change.path, r.change.from] : [r.change.path],
			);
			const result = await host.vcs.savePoint(
				message.trim() || savePointSummary(included.map((r) => r.change)),
				paths,
			);
			setNotice(result.saved ? "Save point made." : "Nothing to save.");
			setMessage("");
			setLeft(new Set());
			historyChanged();
			await load();
		} catch (e) {
			setNotice(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const discard = async (change: VcsChange) => {
		setBusy(true);
		setNotice(null);
		try {
			if (!(await flush())) {
				setNotice(
					"A note couldn't be saved to disk, so nothing was discarded.",
				);
				return;
			}
			const kept = await discardChange(host, change, await lastSavePoint(host));
			setNotice(
				kept
					? `Discarded. The version you had is kept in ${kept}.`
					: "Discarded.",
			);
			setConfirm(null);
			onFilesChanged();
			historyChanged();
			await load();
		} catch (e) {
			setNotice(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	const section = (title: string, list: VcsChange[]) =>
		list.length > 0 && (
			<section className="changes-group" aria-label={title}>
				<h3>{title}</h3>
				<ul>
					{list.map((change) => {
						const row = byPath.get(change.path) as Row;
						return (
							<li key={change.path}>
								<div className="changes-row">
									<input
										type="checkbox"
										aria-label={`Include ${change.path} in the save point`}
										checked={!left.has(change.path)}
										onChange={(e) =>
											setLeft((old) => {
												const next = new Set(old);
												if (e.target.checked) next.delete(change.path);
												else next.add(change.path);
												return next;
											})
										}
									/>
									<button
										type="button"
										className="changes-name"
										aria-expanded={row.diff ? open === change.path : undefined}
										onClick={() =>
											setOpen(open === change.path ? null : change.path)
										}
									>
										<span>{change.path}</span>
										<span className="changes-summary">{row.summary}</span>
									</button>
									<Button
										variant="ghost"
										size="sm"
										disabled={busy}
										onClick={() => setConfirm(change.path)}
									>
										Discard
									</Button>
								</div>
								{confirm === change.path && (
									<p className="changes-confirm" role="alert">
										Put {change.path} back to its last save point? The current
										version is kept in the recovery folder.{" "}
										<Button
											size="sm"
											variant="destructive"
											disabled={busy}
											onClick={() => void discard(change)}
										>
											Discard
										</Button>{" "}
										<Button
											size="sm"
											variant="outline"
											onClick={() => setConfirm(null)}
										>
											Keep
										</Button>
									</p>
								)}
								{open === change.path && row.diff && (
									<NoteDiffView diff={row.diff} />
								)}
							</li>
						);
					})}
				</ul>
			</section>
		);

	return (
		<section className="changes-panel" aria-label="Changes">
			{section("Notes", groups.notes)}
			{section("Files", groups.attachments)}
			{section("App data", groups.appData)}
			{notice && (
				<p className="notice" role="status">
					{notice}
				</p>
			)}
			<form
				className="changes-save"
				onSubmit={(e) => {
					e.preventDefault();
					void save();
				}}
			>
				<Textarea
					aria-label="Save point description"
					rows={2}
					placeholder={
						savePointSummary(included.map((r) => r.change)) ||
						"Describe this save point"
					}
					value={message}
					onChange={(e) => setMessage(e.target.value)}
				/>
				<Button
					type="submit"
					size="sm"
					disabled={busy || included.length === 0}
				>
					Save point ({included.length} of {rows.length})
				</Button>
			</form>
		</section>
	);
}
