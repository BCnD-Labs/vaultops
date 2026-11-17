import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	type BuildInfo,
	type Host,
	HostError,
	type UpdateChannel,
	type UpdateChannelName,
	type UpdateChannels,
	type UpdateScriptStatus,
} from "../host/host";

/** The only Host methods the update section needs. */
export type UpdateHost = Pick<
	Host,
	"startUpdateScript" | "updateScriptStatus" | "buildInfo" | "updateChannels"
>;

const IDLE: UpdateScriptStatus = { state: "idle", lastLine: "" };

const CHANNEL_ROWS = [
	{ key: "main", label: "Main" },
	{ key: "develop", label: "Development" },
] as const;
type ChannelKey = (typeof CHANNEL_ROWS)[number]["key"];

const known = (value: string) => value !== "" && value !== "unknown";

const branchLabel = (branch: string) =>
	CHANNEL_ROWS.find((row) => row.key === branch)?.label ?? branch;

/** "2 hours ago"; a time we cannot read gives "". */
export function relativeTime(iso: string, now: number): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) return "";
	const minutes = Math.max(0, Math.floor((now - then) / 60_000));
	const unit = (n: number, word: string) =>
		`${n} ${word}${n === 1 ? "" : "s"} ago`;
	if (minutes < 1) return "just now";
	if (minutes < 60) return unit(minutes, "minute");
	if (minutes < 60 * 24) return unit(Math.floor(minutes / 60), "hour");
	return unit(Math.floor(minutes / (60 * 24)), "day");
}

/** "17 Nov, 10:40" in the viewer's time zone; "" for a time we cannot read. */
export function shortDateTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString("en-GB", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function runningNow(build: BuildInfo): string {
	const bits = [
		known(build.branch) ? branchLabel(build.branch) : "",
		known(build.commit) ? build.commit.slice(0, 7) : "",
		known(build.builtAt) && shortDateTime(build.builtAt)
			? `built ${shortDateTime(build.builtAt)}`
			: "",
	].filter(Boolean);
	return bits.length > 0 ? bits.join(" · ") : "a development build";
}

/**
 * Which row counts as the running one for the buttons. A build with no recorded
 * branch (made before the installer wrote one) counts as Main: its first update
 * fills the version info in.
 */
function runningChannel(build: BuildInfo): ChannelKey | null {
	if (build.branch === "unknown") return "main";
	return CHANNEL_ROWS.find((row) => row.key === build.branch)?.key ?? null;
}

type Action = { channel: ChannelKey; kind: "update" | "switch" };

/** What the row's button does: update the running channel, or switch to the other. */
function rowAction(
	build: BuildInfo,
	channels: UpdateChannels,
	key: ChannelKey,
): Action | null {
	if (!channels[key].exists) return null;
	if (key !== runningChannel(build)) return { channel: key, kind: "switch" };
	return channelStatus(build, channels[key], key) === "Update available" ||
		build.branch === "unknown"
		? { channel: key, kind: "update" }
		: null;
}

const buttonLabel = ({ channel, kind }: Action) =>
	kind === "update" ? "Update" : `Switch to ${branchLabel(channel)}`;

const WHEN_READY =
	"When it is ready, VaultOps saves your note, closes and opens again.";

function question({ channel, kind }: Action): string {
	const label = branchLabel(channel);
	if (kind === "update") {
		return `Update to the newest ${label}? VaultOps builds it, which takes several minutes. You can keep working. ${WHEN_READY}`;
	}
	return `Switch to ${label}? The app rebuilds from the ${channel} branch and reopens. The current app is kept as VaultOps (previous). It takes several minutes and you can keep working. ${WHEN_READY}`;
}

/** How a channel compares with what is running. */
export function channelStatus(
	build: BuildInfo,
	channel: UpdateChannel,
	key: ChannelKey,
): string {
	if (!channel.exists) return "Not set up yet";
	if (runningChannel(build) !== key) return "Not installed";
	return build.commit === channel.commit ? "Up to date" : "Update available";
}

/**
 * STOPGAP(update-script): the Settings update buttons. Each branch row has one:
 * "Update" for the running branch when it is behind, "Switch to ..." for the
 * other. They run the maintainer's install script for that branch (check out,
 * build, install, reopen) through the host until the real in-app updater
 * (issues 274 and 275) can ship; delete this file and its test then. Pressing
 * a button asks first, and nothing starts before "Update now". The status is read once when Settings opens (a run may
 * already be going) and then only while one runs. It also checks GitHub (a git
 * fetch of `main` and `develop` in the code folder) when it opens and when
 * "Check for updates" is pressed, and says for each branch whether it is the
 * one running and whether it is up to date.
 */
export function UpdateSection({
	host,
	pollMs = 2000,
}: {
	host: UpdateHost;
	pollMs?: number;
}) {
	const [asking, setAsking] = useState<Action | null>(null);
	const [status, setStatus] = useState<UpdateScriptStatus>(IDLE);
	const [startError, setStartError] = useState<string | null>(null);
	const running = status.state === "running";
	const [build, setBuild] = useState<BuildInfo | null>(null);
	const [channels, setChannels] = useState<UpdateChannels | null>(null);
	const [checking, setChecking] = useState(false);
	const [checkedAt, setCheckedAt] = useState<Date | null>(null);
	const [checkError, setCheckError] = useState<string | null>(null);

	const check = useCallback(async () => {
		setChecking(true);
		try {
			const [info, found] = await Promise.all([
				host.buildInfo(),
				host.updateChannels(),
			]);
			setBuild(info);
			setChannels(found);
			setCheckError(found.error);
		} catch (error) {
			setCheckError(
				error instanceof HostError
					? error.message
					: "Could not check for updates.",
			);
		}
		setCheckedAt(new Date());
		setChecking(false);
	}, [host]);

	useEffect(() => {
		void check();
	}, [check]);

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

	const start = async (action: Action) => {
		setAsking(null);
		setStartError(null);
		try {
			await host.startUpdateScript(action.channel);
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
			{build && (
				<p className="settings-note">Running now: {runningNow(build)}</p>
			)}
			{build?.branch === "unknown" && (
				<p className="settings-note">
					This build has no version info yet. The first update fills it in.
				</p>
			)}
			{build &&
				channels &&
				CHANNEL_ROWS.map(({ key, label }) => {
					const channel = channels[key];
					const when = relativeTime(channel.committedAt, Date.now());
					const action = rowAction(build, channels, key);
					return (
						<div className="settings-row" key={key}>
							<span>
								{label}
								{channel.exists &&
									` · ${channel.shortCommit} · ${channel.subject}${when ? ` · ${when}` : ""}`}
							</span>
							<span>
								{channelStatus(build, channel, key)}{" "}
								{action && (
									<Button
										variant="secondary"
										disabled={running}
										onClick={() => setAsking(action)}
									>
										{buttonLabel(action)}
									</Button>
								)}
							</span>
						</div>
					);
				})}
			<div className="settings-row">
				<span>
					{checking
						? "Checking GitHub…"
						: checkedAt
							? `Checked at ${checkedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
							: ""}
				</span>
				<Button
					variant="secondary"
					disabled={checking}
					onClick={() => void check()}
				>
					Check for updates
				</Button>
			</div>
			{checkError && (
				<p className="settings-note" role="alert">
					Could not check GitHub: {checkError}
				</p>
			)}
			{asking && !running && (
				<>
					<p className="settings-note">{question(asking)}</p>
					<div className="settings-row">
						<Button onClick={() => void start(asking)}>Update now</Button>
						<Button variant="ghost" onClick={() => setAsking(null)}>
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
