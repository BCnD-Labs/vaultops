/** The file name for a report made at `now`: safe characters only, ends in .txt. */
export function reportFileName(
	now: Date,
	kind: "report" | "crash" = "report",
): string {
	const stamp = now.toISOString().slice(0, 19).replace(/:/g, "-");
	return `vaultops-${kind}-${stamp}Z.txt`;
}

export interface BundleInput {
	/** The debug report (counters, native calls, errors, recent events). */
	debug: string;
	/** The last lines of the log file. */
	logTail: string;
	/** The last saved crash report, if any. */
	crash: string | null;
}

/**
 * Everything worth reading about the app's state in one text file. It never
 * includes note text: the debug report and log carry paths and sizes only, and
 * the text kept at quit is deliberately left out. (A captured error message
 * could still quote text a parser choked on, so the maintainer reads a report
 * before sharing it.)
 */
export function bundleReport(input: BundleInput): string {
	return [
		input.debug.trimEnd(),
		"",
		"==== Log file (last lines) ====",
		input.logTail.trim() === ""
			? "(the log was empty)"
			: input.logTail.trimEnd(),
		"",
		"==== Last saved crash report ====",
		input.crash === null ? "(none saved)" : input.crash.trimEnd(),
		"",
	].join("\n");
}
