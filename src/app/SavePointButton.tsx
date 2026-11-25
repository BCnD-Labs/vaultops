import { History } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { savePointSummary } from "../core/history/summary";
import type { Host, VcsStatus } from "../host/host";
import { historyChanged } from "./change-dots";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The Save point button in the status bar, shown once history is on. It
 * counts what changed since the last save point and opens a small box with a
 * prefilled description; typing is optional. Open notes are saved to disk
 * first, so the save point holds what is on screen.
 */
export function SavePointButton({
	host,
	flush,
	onOpenHistory,
}: {
	host: Pick<Host, "vcs">;
	/** Save every open note to disk; false when one couldn't be saved. */
	flush: () => Promise<boolean>;
	/** Open the History screen. */
	onOpenHistory?: () => void;
}) {
	const [status, setStatus] = useState<VcsStatus | null>(null);
	const [open, setOpen] = useState(false);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			setStatus(await host.vcs.status());
		} catch {
			setStatus(null);
		}
	}, [host]);

	useEffect(() => {
		void refresh();
		const onFocus = () => void refresh();
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [refresh]);

	if (!status?.enabled) return null;
	const count = status.changes.length;
	const summary = savePointSummary(status.changes);

	const save = async () => {
		setBusy(true);
		setNotice(null);
		try {
			if (!(await flush())) {
				setNotice(
					"A note couldn't be saved to disk, so no save point was made. Check the note's save status and try again.",
				);
				return;
			}
			// Saving open notes may have changed what there is to save.
			const fresh = await host.vcs.status();
			const result = await host.vcs.savePoint(
				message.trim() || savePointSummary(fresh.changes),
			);
			setStatus(result.status);
			historyChanged();
			if (result.saved) {
				setMessage("");
				setOpen(false);
			} else {
				setNotice("Everything is already in history.");
			}
		} catch (error) {
			setNotice(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				setNotice(null);
				if (next) void refresh();
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="save-point-button"
					title={
						count === 0
							? "Everything is in history"
							: `${plural(count, "change")} since the last save point`
					}
				>
					<History aria-hidden="true" />
					Save point
					{count > 0 && <span className="save-point-count">{count}</span>}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" className="save-point-popover">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<p className="settings-note">
						{count === 0
							? "Nothing changed since the last save point."
							: `${plural(count, "file")} changed since the last save point.`}
					</p>
					<Textarea
						aria-label="Save point description"
						placeholder={summary || "Describe this save point"}
						value={message}
						rows={3}
						onChange={(event) => setMessage(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
								event.preventDefault();
								void save();
							}
						}}
					/>
					{notice && (
						<p role="alert" className="notice">
							{notice}
						</p>
					)}
					<div className="save-point-actions">
						{onOpenHistory && (
							<Button
								type="button"
								variant="link"
								size="sm"
								onClick={() => {
									setOpen(false);
									onOpenHistory();
								}}
							>
								View history
							</Button>
						)}
						<Button type="submit" size="sm" disabled={busy || count === 0}>
							{busy ? "Saving…" : "Make save point"}
						</Button>
					</div>
				</form>
			</PopoverContent>
		</Popover>
	);
}
