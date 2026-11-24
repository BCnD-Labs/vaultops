import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { restoreVaultTo } from "../core/history/restore-vault";
import type { Host, VcsLogEntry } from "../host/host";

type ActionsHost = Pick<Host, "vcs" | "kindOf" | "makeFolder" | "move">;

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
 * What can be done with one save point: restore the whole vault to it, or
 * undo just its changes. Both make a new save point, so they can be undone
 * too, and neither deletes anything.
 */
export function SavePointActions({
	host,
	entry,
	beforeChange,
	onChanged,
}: {
	host: ActionsHost;
	entry: VcsLogEntry;
	/** Save open notes to disk first; false when one couldn't be saved. */
	beforeChange?: () => Promise<boolean>;
	/** The vault's files changed: read them again. */
	onChanged: (message: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [trashNewer, setTrashNewer] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = async (action: () => Promise<string>) => {
		setBusy(true);
		setError(null);
		try {
			if (beforeChange && !(await beforeChange())) {
				setError("A note couldn't be saved to disk, so nothing was changed.");
				return;
			}
			const message = await action();
			setOpen(false);
			setConfirming(false);
			onChanged(message);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setConfirming(false);
				setError(null);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					className="history-actions"
					aria-label={`Actions for ${entry.subject}`}
				>
					<MoreHorizontal aria-hidden="true" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="save-point-actions-menu">
				{!confirming ? (
					<>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirming(true)}
						>
							Restore vault to this save point…
						</Button>
						<Button
							variant="ghost"
							size="sm"
							disabled={busy || entry.parents.length !== 1}
							title={
								entry.parents.length !== 1
									? "A merge or the first save point can't be undone on its own"
									: undefined
							}
							onClick={() =>
								void run(async () => {
									await host.vcs.undoSavePoint(entry.id);
									return `Undid "${entry.subject}".`;
								})
							}
						>
							Undo this save point
						</Button>
					</>
				) : (
					<form
						className="restore-confirm"
						onSubmit={(e) => {
							e.preventDefault();
							void run(async () => {
								const report = await restoreVaultTo(host, entry, {
									trashNewer,
									label: when(entry.date),
								});
								return `Restored the vault to ${when(entry.date)}. ${
									report.trashed.length
										? `${report.trashed.length} newer note(s) moved to the trash.`
										: report.kept.length
											? `${report.kept.length} newer file(s) kept.`
											: ""
								}`.trim();
							});
						}}
					>
						<p>
							Every note that existed on {when(entry.date)} goes back to how it
							was then. Your current version is kept in history first.
						</p>
						<label className="restore-trash">
							<input
								type="checkbox"
								checked={trashNewer}
								onChange={(e) => setTrashNewer(e.target.checked)}
							/>
							Also move notes created after it to the trash
						</label>
						<Button type="submit" size="sm" disabled={busy}>
							{busy ? "Restoring…" : "Restore vault"}
						</Button>
					</form>
				)}
				{error && (
					<p role="alert" className="notice">
						{error}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
