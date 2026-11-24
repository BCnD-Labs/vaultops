import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GitInfo, Host, VcsStatus } from "../host/host";

export type HistoryHost = Pick<Host, "vcs">;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Settings → History: whether the vault keeps save points, and the one
 * button that turns them on. Everything stays on this Mac.
 */
export function HistorySection({ host }: { host: HistoryHost }) {
	const [git, setGit] = useState<GitInfo | null>(null);
	const [status, setStatus] = useState<VcsStatus | null>(null);
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		let live = true;
		void Promise.all([host.vcs.detect(), host.vcs.status()]).then(
			([g, s]) => {
				if (!live) return;
				setGit(g);
				setStatus(s);
			},
			(error: unknown) => {
				if (live)
					setMessage(error instanceof Error ? error.message : String(error));
			},
		);
		return () => {
			live = false;
		};
	}, [host]);

	const turnOn = async () => {
		setBusy(true);
		setMessage(null);
		try {
			setStatus(await host.vcs.enable(name));
		} catch (error) {
			setMessage(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	if (!git || !status) {
		return message ? (
			<p role="alert" className="notice">
				{message}
			</p>
		) : (
			<p className="settings-note">Checking history…</p>
		);
	}

	const body = () => {
		if (status.enabled) {
			return (
				<div className="settings-row" role="status">
					<div className="settings-row-text">
						<span>History is on</span>
						<p className="settings-note">
							Branch {status.branch ?? "(none)"} ·{" "}
							{status.changes.length === 0
								? "everything is saved in history"
								: `${plural(status.changes.length, "file")} changed since the last save point`}
						</p>
					</div>
				</div>
			);
		}
		if (status.otherRepo) {
			return (
				<p className="settings-note" role="status">
					This vault folder already is a git repository made outside VaultOps,
					so history stays off and VaultOps leaves it alone.
				</p>
			);
		}
		if (!git.found) {
			return (
				<p className="settings-note" role="status">
					History needs git.{" "}
					{git.needsDeveloperTools
						? "Install Apple's free developer tools: open Terminal, run xcode-select --install, then reopen VaultOps."
						: "Install git, then reopen VaultOps."}
				</p>
			);
		}
		return (
			<>
				<p className="settings-note">
					Keep save points of your notes so you can see what changed and go back
					to any earlier version. Everything stays on this Mac; nothing is
					uploaded.
				</p>
				{status.syncedFolder && (
					<p className="notice" role="note">
						This vault is in {status.syncedFolder}. Its syncing can damage the
						history folder; a vault outside cloud folders is safer.
					</p>
				)}
				<form
					className="settings-row history-enable"
					onSubmit={(event) => {
						event.preventDefault();
						void turnOn();
					}}
				>
					<div className="settings-row-text">
						<label htmlFor="history-name">Your name</label>
						<span className="settings-note">Shown on your save points.</span>
						<Input
							id="history-name"
							value={name}
							maxLength={80}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
					<Button type="submit" disabled={busy || name.trim() === ""}>
						{busy ? "Turning on…" : "Turn on history"}
					</Button>
				</form>
			</>
		);
	};

	return (
		<>
			{body()}
			{message && (
				<p role="alert" className="notice">
					{message}
				</p>
			)}
		</>
	);
}
