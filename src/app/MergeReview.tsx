import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type MergeReport, runBranchMerge } from "../core/history/merge-run";
import type { Host } from "../host/host";

type MergeHost = Pick<
	Host,
	"vcs" | "writeTextAtomic" | "makeFolder" | "kindOf"
>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Merging a branch into the current one: the app combines everything first,
 * then this shows what happened before anything becomes a save point.
 * Finish makes the merge's save point; Cancel puts every file back.
 */
export function MergeReview({
	host,
	branch,
	current,
	beforeStart,
	onDone,
}: {
	host: MergeHost;
	branch: string;
	current: string | null;
	/** Save open notes to disk first; false when one couldn't be saved. */
	beforeStart?: () => Promise<boolean>;
	/** The merge ended; `filesChanged` when the vault's files are different now. */
	onDone: (filesChanged: boolean) => void;
}) {
	const [report, setReport] = useState<MergeReport | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(true);
	const [message, setMessage] = useState(
		`Merged ${branch} into ${current ?? "this branch"}`,
	);
	const started = useRef(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		void (async () => {
			try {
				if (beforeStart && !(await beforeStart())) {
					setError(
						"A note couldn't be saved to disk, so the merge didn't start.",
					);
					return;
				}
				setReport(await runBranchMerge(host, branch));
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				setBusy(false);
			}
		})();
	}, [host, branch, beforeStart]);

	const end = async (finish: boolean) => {
		setBusy(true);
		setError(null);
		try {
			if (finish) await host.vcs.mergeFinish(message);
			else await host.vcs.mergeAbort();
			onDone(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setBusy(false);
		}
	};

	const spots = report?.outcomes.reduce(
		(n, o) => n + (o.kind === "merged" ? o.conflicts.length : 0),
		0,
	);

	return (
		<section className="merge-review" aria-label="Merge">
			<h3>
				Merge {branch} into {current ?? "this branch"}
			</h3>
			{busy && !report && <p className="settings-note">Merging…</p>}
			{error && (
				<p role="alert" className="notice">
					{error}
				</p>
			)}
			{error && !report && (
				<Button variant="outline" size="sm" onClick={() => onDone(false)}>
					Close
				</Button>
			)}
			{report?.upToDate && (
				<>
					<p role="status">
						Nothing to merge: {current ?? "this branch"} already has everything
						from {branch}.
					</p>
					<Button variant="outline" size="sm" onClick={() => onDone(false)}>
						Close
					</Button>
				</>
			)}
			{report && !report.upToDate && (
				<>
					<p role="status">
						{plural(report.changed.length, "file")} change.{" "}
						{report.outcomes.length === 0
							? "Nothing was changed on both sides."
							: `${plural(report.outcomes.length, "file")} changed on both sides${spots ? `, with ${plural(spots, "spot")} changed in two places` : ""}.`}
					</p>
					{report.outcomes.length > 0 && (
						<ul className="merge-outcomes">
							{report.outcomes.map((o) => (
								<li key={o.path}>
									<strong>{o.path}</strong>{" "}
									{o.kind === "merged" &&
										(o.conflicts.length === 0
											? "combined"
											: `combined; ${plural(o.conflicts.length, "spot")} changed in two places (yours kept, theirs shown in a yellow callout or kept where noted)`)}
									{o.kind === "kept-edited" &&
										"deleted on one side and edited on the other: the edited version is kept"}
									{o.kind === "kept-mine" &&
										`${o.reason}: yours kept, theirs saved in ${o.recoveryPath}`}
								</li>
							))}
						</ul>
					)}
					<form
						className="merge-finish"
						onSubmit={(e) => {
							e.preventDefault();
							void end(true);
						}}
					>
						<Input
							aria-label="Merge description"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
						/>
						<Button type="submit" size="sm" disabled={busy}>
							Finish merge
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={busy}
							onClick={() => void end(false)}
						>
							Cancel merge
						</Button>
					</form>
				</>
			)}
		</section>
	);
}
