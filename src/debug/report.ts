import type { LogEntry, Logger } from "./logger";

function line(e: LogEntry): string {
	const time = new Date(e.t).toISOString().slice(11, 23);
	const ms = e.ms === undefined ? "" : ` ${e.ms}ms`;
	const ok = e.ok === undefined ? "" : e.ok ? " ok" : " FAILED";
	const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
	return `${time} ${e.kind}/${e.name}${ms}${ok}${detail}`;
}

export interface ReportInput {
	app: { name: string; version: string };
	environment: string;
	now?: number;
	/** How many of the newest entries to include. */
	recent?: number;
}

/**
 * A plain-text report to paste into a conversation: versions, counters, how
 * each native call performed, every error, and the most recent events.
 */
export function buildReport(logger: Logger, input: ReportInput): string {
	const entries = logger.entries();
	const recent = entries.slice(-(input.recent ?? 200));
	const errors = entries.filter((e) => e.ok === false || e.kind === "error");
	const out: string[] = [
		`VaultOps debug report`,
		`app: ${input.app.name} ${input.app.version}`,
		`environment: ${input.environment}`,
		`time: ${new Date(input.now ?? Date.now()).toISOString()}`,
		`events kept: ${entries.length}, dropped before reaching the file: ${logger.dropped()}`,
		"",
		"Counters",
		...Object.entries(logger.counters())
			.sort()
			.map(([k, v]) => `  ${k}: ${v}`),
		"",
		"Native calls (count, failures, average ms, worst ms)",
		...Object.entries(logger.stats())
			.sort()
			.map(
				([k, s]) =>
					`  ${k}: ${s.count}, ${s.failures}, ${(s.totalMs / s.count).toFixed(2)}, ${s.maxMs}`,
			),
		"",
		`Errors and failures (${errors.length})`,
		...errors.slice(-50).map((e) => `  ${line(e)}`),
		"",
		`Most recent events (${recent.length})`,
		...recent.map((e) => `  ${line(e)}`),
	];
	return out.join("\n");
}
