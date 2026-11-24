import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { blockText, diffNotes, summarizeDiff } from "../core/history/diff";
import { copyBlockBack, restoreVersion } from "../core/history/restore";
import { type Note, parseNote } from "../core/note-format";
import type { Host, VcsLogEntry } from "../host/host";
import { NoteBlocks } from "./CanvasCard";

const PAGE = 30;

const when = (iso: string) => {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			});
};

type Version =
	| { state: "loading" }
	| { state: "error"; message: string }
	| { state: "ready"; note: Note; compared: string };

/**
 * The open note's history in the side panel: every save point that changed
 * it, newest first. Picking one shows that version read-only, and how it
 * differs from the note as it is saved now.
 */
export function NoteHistoryPanel({
	host,
	path,
	onApply,
}: {
	host: Pick<Host, "vcs" | "readText">;
	/** The open note's vault path. */
	path: string;
	/**
	 * Write a new version of the note made from what's on disk now (the app
	 * saves open notes first, keeps the current text in history and reloads
	 * the editor). Resolves to a reason when it didn't happen.
	 */
	onApply?: (
		build: (current: Note | null) => Note,
		label: string,
	) => Promise<string | null>;
}) {
	const [enabled, setEnabled] = useState<boolean | null>(null);
	const [entries, setEntries] = useState<VcsLogEntry[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [picked, setPicked] = useState<VcsLogEntry | null>(null);
	const [version, setVersion] = useState<Version | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const apply = async (
		build: (current: Note | null) => Note,
		label: string,
		done: string,
	) => {
		if (!onApply) return;
		setBusy(true);
		setNotice(null);
		try {
			const refused = await onApply(build, label);
			setNotice(refused ?? done);
			if (!refused) {
				await load(0);
				if (picked) await pick(picked);
			}
		} finally {
			setBusy(false);
		}
	};

	const load = async (skip: number) => {
		try {
			const status = await host.vcs.status();
			setEnabled(status.enabled);
			if (!status.enabled) return;
			const page = await host.vcs.log({ path, skip, limit: PAGE });
			setEntries((old) =>
				skip === 0 ? page.entries : [...old, ...page.entries],
			);
			setHasMore(page.hasMore);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the note or host changes.
	useEffect(() => {
		setPicked(null);
		setVersion(null);
		void load(0);
	}, [host, path]);

	const pick = async (entry: VcsLogEntry) => {
		setPicked(entry);
		setVersion({ state: "loading" });
		try {
			const old = parseNote(
				await host.vcs.show(entry.id, entry.path ?? path),
			).note;
			if (!old) throw new Error("This version could not be read.");
			let now: Note | null = null;
			try {
				now = parseNote(await host.readText(path)).note;
			} catch {
				now = null;
			}
			const diff = diffNotes(old, now);
			setVersion({
				state: "ready",
				note: old,
				compared: diff.same
					? "Same as now"
					: `Since then: ${summarizeDiff(diff)}`,
			});
		} catch (e) {
			setVersion({
				state: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	};

	if (error)
		return (
			<p role="alert" className="notice">
				{error}
			</p>
		);
	if (enabled === null)
		return <p className="settings-note">Loading history…</p>;
	if (!enabled)
		return (
			<p className="settings-note">
				History is off. Turn it on in Settings → History to keep versions of
				this note.
			</p>
		);
	if (entries.length === 0)
		return (
			<p className="settings-note">
				No save points include this note yet. Make a save point to keep this
				version.
			</p>
		);

	return (
		<section className="note-history" aria-label="Note history">
			<ol className="note-history-list">
				{entries.map((entry) => (
					<li key={entry.id}>
						<button
							type="button"
							className="note-history-row"
							aria-pressed={picked?.id === entry.id}
							onClick={() => void pick(entry)}
						>
							<span className="note-history-subject">{entry.subject}</span>
							<span className="note-history-detail">
								<time dateTime={entry.date}>{when(entry.date)}</time>
								{entry.path && entry.path !== path && ` · was ${entry.path}`}
							</span>
						</button>
					</li>
				))}
			</ol>
			{hasMore && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => void load(entries.length)}
				>
					Load older versions
				</Button>
			)}
			{picked && version && (
				<section className="note-history-version" aria-label="Version">
					<p className="note-history-banner" role="status">
						{when(picked.date)} · read-only
						{version.state === "ready" && <> · {version.compared}</>}
					</p>
					{version.state === "loading" && (
						<p className="settings-note">Loading…</p>
					)}
					{version.state === "error" && (
						<p role="alert" className="notice">
							{version.message}
						</p>
					)}
					{version.state === "ready" && onApply && (
						<div className="note-history-actions">
							<Button
								size="sm"
								disabled={busy}
								onClick={() =>
									void apply(
										(current) => restoreVersion(version.note, current),
										`restoring ${when(picked.date)}`,
										"Restored. The text it replaced is kept in history.",
									)
								}
							>
								Restore this version
							</Button>
						</div>
					)}
					{notice && (
						<p className="notice" role="status">
							{notice}
						</p>
					)}
					{version.state === "ready" && onApply && (
						<details className="note-history-copy">
							<summary>Copy a block back</summary>
							<ul>
								{version.note.blocks
									.filter(
										(b) =>
											b.parent === null && b.id && blockText(b).trim() !== "",
									)
									.map((b) => (
										<li key={b.id}>
											<span>{blockText(b).slice(0, 80)}</span>
											<Button
												variant="outline"
												size="sm"
												disabled={busy}
												aria-label={`Copy back: ${blockText(b).slice(0, 40)}`}
												onClick={() =>
													void apply(
														(current) =>
															current
																? copyBlockBack(
																		current,
																		version.note,
																		b.id as string,
																	)
																: version.note,
														"copying a block back",
														"Block copied back into the note.",
													)
												}
											>
												Copy back
											</Button>
										</li>
									))}
							</ul>
						</details>
					)}
					{version.state === "ready" && (
						<div className="note-editor note-history-blocks">
							<h3>{String(version.note.header.title ?? "")}</h3>
							<NoteBlocks blocks={version.note.blocks} />
						</div>
					)}
				</section>
			)}
		</section>
	);
}
