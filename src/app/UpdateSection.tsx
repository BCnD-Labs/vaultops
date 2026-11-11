import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Host, HostError, type UpdateScriptStatus } from "../host/host";

/** The only Host methods the update button needs. */
export type UpdateHost = Pick<Host, "startUpdateScript" | "updateScriptStatus">;

const IDLE: UpdateScriptStatus = { state: "idle", lastLine: "" };

/**
 * STOPGAP(update-script): the Settings "Update VaultOps" button. It runs the
 * maintainer's install script (pull, build, install, reopen) through the host
 * until the real in-app updater (issues 274 and 275) can ship; delete this
 * file and its test then. Pressing the button asks first, and nothing starts
 * before "Update now". The status is read once when Settings opens (a run may
 * already be going) and then only while one runs.
 */
export function UpdateSection({
	host,
	pollMs = 2000,
}: {
	host: UpdateHost;
	pollMs?: number;
}) {
	const [asking, setAsking] = useState(false);
	const [status, setStatus] = useState<UpdateScriptStatus>(IDLE);
	const [startError, setStartError] = useState<string | null>(null);
	const running = status.state === "running";

	useEffect(() => {
		let current = true;
		const look = () => {
			host.updateScriptStatus().then(
				(next) => {
					if (current) setStatus(next);
				},
				() => {},
			);
		};
		look();
		if (!running) {
			return () => {
				current = false;
			};
		}
		const timer = setInterval(look, pollMs);
		return () => {
			current = false;
			clearInterval(timer);
		};
	}, [host, running, pollMs]);

	const start = async () => {
		setAsking(false);
		setStartError(null);
		try {
			await host.startUpdateScript();
			setStatus({ state: "running", lastLine: "" });
		} catch (error) {
			setStartError(
				error instanceof HostError
					? `Could not start the update: ${error.message}.`
					: "Could not start the update.",
			);
		}
	};

	return (
		<>
			<h3 className="section-label">Updates</h3>
			<div className="settings-row">
				<span id="settings-update">Get the newest version of VaultOps</span>
				<Button
					variant="secondary"
					disabled={running || asking}
					onClick={() => setAsking(true)}
				>
					Update VaultOps
				</Button>
			</div>
			{asking && (
				<>
					<p className="settings-note">
						VaultOps will pull the newest version and build it, which takes
						several minutes. You can keep working. When it is ready, VaultOps
						saves your note, closes and opens again.
					</p>
					<div className="settings-row">
						<Button onClick={() => void start()}>Update now</Button>
						<Button variant="ghost" onClick={() => setAsking(false)}>
							Cancel
						</Button>
					</div>
				</>
			)}
			{running && (
				<p className="settings-note" role="status">
					Updating… {status.lastLine}
				</p>
			)}
			{status.state === "failed" && (
				<p className="settings-note" role="alert">
					The update did not finish. {status.lastLine}
				</p>
			)}
			{status.state === "finished" && (
				<p className="settings-note" role="status">
					The update finished. The new VaultOps opens by itself; if you still
					see this window, quit and open VaultOps again.
				</p>
			)}
			{startError && (
				<p className="settings-note" role="alert">
					{startError}
				</p>
			)}
		</>
	);
}
