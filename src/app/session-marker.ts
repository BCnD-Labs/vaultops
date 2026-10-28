import {
	cleanMarker,
	parseMarker,
	runningMarker,
	type SessionMarker,
} from "../core/session/crash";
import type { Host } from "../host/host";

/** How many log lines the crash report shows. */
export const CRASH_LOG_LINES = 30;

export interface PreviousCrash {
	startedAt: string;
	version: string;
	logTail: string;
}

/**
 * Called once at start. Reads the marker the last run left, then writes a new
 * "running" marker. Resolves to the details when the last run did not exit
 * cleanly, otherwise null. Never throws: if the app's files can't be used,
 * there is simply no crash report.
 */
export async function checkPreviousSession(
	host: Host,
	version: string,
	now: Date = new Date(),
): Promise<PreviousCrash | null> {
	let found: PreviousCrash | null = null;
	try {
		const previous = parseMarker(await host.readAppFile("session.json"));
		if (previous?.state === "running") {
			found = {
				startedAt: previous.startedAt,
				version: previous.version,
				logTail: await host.readLogTail(CRASH_LOG_LINES),
			};
		}
	} catch {
		found = null;
	}
	try {
		await host.writeAppFile("session.json", runningMarker(now, version));
	} catch {
		// Without the marker the next start just shows no report.
	}
	return found;
}

/** Record a clean exit. Best effort. */
export async function markCleanExit(
	host: Host,
	now: Date = new Date(),
): Promise<void> {
	try {
		const previous: SessionMarker | null = parseMarker(
			await host.readAppFile("session.json"),
		);
		await host.writeAppFile("session.json", cleanMarker(previous, now));
	} catch {
		// The next start may show a report that wasn't needed; that is harmless.
	}
}

/** The same host, but a close that is allowed also records a clean exit. */
export function markCleanOnClose(host: Host): Host {
	return {
		...host,
		onCloseRequested: (handler) =>
			host.onCloseRequested(async () => {
				const allowed = await handler();
				if (allowed) await markCleanExit(host);
				return allowed;
			}),
	};
}
