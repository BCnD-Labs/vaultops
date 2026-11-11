/**
 * Noticing that the app did not exit cleanly. At start the app writes a
 * "running" marker; a clean quit replaces it with "clean". Finding "running"
 * at the next start means the last run ended without a clean quit.
 */
export interface SessionMarker {
	state: "running" | "clean";
	startedAt: string;
	version: string;
}

export function runningMarker(now: Date, version: string): string {
	const marker: SessionMarker = {
		state: "running",
		startedAt: now.toISOString(),
		version,
	};
	return JSON.stringify(marker);
}

export function cleanMarker(previous: SessionMarker | null, now: Date): string {
	const marker: SessionMarker = {
		state: "clean",
		startedAt: previous?.startedAt ?? now.toISOString(),
		version: previous?.version ?? "",
	};
	return JSON.stringify(marker);
}

/** A marker from disk, or null if there is none or it can't be understood. */
export function parseMarker(text: string | null): SessionMarker | null {
	if (text === null) return null;
	try {
		const value: unknown = JSON.parse(text);
		if (typeof value !== "object" || value === null) return null;
		const { state, startedAt, version } = value as Record<string, unknown>;
		if (state !== "running" && state !== "clean") return null;
		if (typeof startedAt !== "string" || typeof version !== "string") {
			return null;
		}
		return { state, startedAt, version };
	} catch {
		return null;
	}
}

export interface CrashReportInput {
	startedAt: string;
	version: string;
	logTail: string;
	notes: string;
	now: Date;
}

/** The plain text that is copied or saved. Nothing is sent anywhere. */
export function buildCrashReport(input: CrashReportInput): string {
	const notes = input.notes.trim();
	return [
		"VaultOps crash report",
		`app version: ${input.version || "unknown"}`,
		`the closed run started: ${input.startedAt}`,
		`report made: ${input.now.toISOString()}`,
		"",
		"What I was doing",
		notes === "" ? "(not filled in)" : notes,
		"",
		"Last log lines before it closed",
		input.logTail.trim() === ""
			? "(the log was empty)"
			: input.logTail.trimEnd(),
		"",
	].join("\n");
}
