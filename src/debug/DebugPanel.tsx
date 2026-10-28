import { useEffect, useState, useSyncExternalStore } from "react";
import type { Logger } from "./logger";
import { buildReport } from "./report";

/** Cmd+Shift+D: recent events, counters and a button that copies a report. */
export function DebugPanel({
	logger,
	app,
	onClose,
}: {
	logger: Logger;
	app: { name: string; version: string };
	onClose: () => void;
}) {
	const [errorsOnly, setErrorsOnly] = useState(false);
	const [copied, setCopied] = useState<string | null>(null);
	// Re-render when something is logged.
	useSyncExternalStore(
		(onChange) => logger.subscribe(onChange),
		() => logger.version(),
	);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const all = logger.entries();
	const shown = (
		errorsOnly ? all.filter((e) => e.ok === false || e.kind === "error") : all
	)
		.slice(-200)
		.reverse();
	const counters = logger.counters();
	const stats = logger.stats();

	const copy = async () => {
		const text = buildReport(logger, {
			app,
			environment: navigator.userAgent,
		});
		try {
			await navigator.clipboard.writeText(text);
			setCopied("Report copied");
		} catch {
			setCopied("Could not copy; select the text below instead");
		}
	};

	return (
		<div className="debug-panel" role="dialog" aria-label="Debug panel">
			<div className="debug-panel-bar">
				<strong>Debug</strong>
				<label>
					<input
						type="checkbox"
						checked={errorsOnly}
						onChange={(e) => setErrorsOnly(e.target.checked)}
					/>{" "}
					Errors only
				</label>
				<button type="button" onClick={copy}>
					Copy report
				</button>
				<button type="button" onClick={onClose}>
					Close
				</button>
				<span role="status">{copied}</span>
			</div>
			<div className="debug-panel-summary">
				{Object.entries(counters).map(([k, v]) => (
					<span key={k}>
						{k}: {v}
					</span>
				))}
				{Object.entries(stats).map(([k, s]) => (
					<span key={k}>
						{k}: {s.count}× avg {(s.totalMs / s.count).toFixed(1)}ms
						{s.failures > 0 && ` (${s.failures} failed)`}
					</span>
				))}
			</div>
			<pre className="debug-panel-log">
				{shown.length === 0
					? "Nothing recorded yet."
					: shown
							.map((e) => {
								const time = new Date(e.t).toISOString().slice(11, 23);
								const ms = e.ms === undefined ? "" : ` ${e.ms}ms`;
								const ok = e.ok === false ? " FAILED" : "";
								const d = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
								return `${time} ${e.kind}/${e.name}${ms}${ok}${d}`;
							})
							.join("\n")}
			</pre>
		</div>
	);
}
