import { useState } from "react";
import type { PreviousCrash } from "../app/session-marker";
import { buildCrashReport } from "../core/session/crash";
import type { Host } from "../host/host";

/**
 * Shown at the next start after the app closed without a clean quit: the last
 * log lines, a box for what was being done, and buttons to copy or save the
 * report. Nothing is sent over the network.
 */
export function CrashReport({
	crash,
	host,
	onClose,
}: {
	crash: PreviousCrash;
	host: Pick<Host, "writeAppFile">;
	onClose: () => void;
}) {
	const [notes, setNotes] = useState("");
	const [status, setStatus] = useState<string | null>(null);
	const text = () => buildCrashReport({ ...crash, notes, now: new Date() });

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text());
			setStatus("Report copied");
		} catch {
			setStatus("Could not copy; use Save instead");
		}
	};
	const save = async () => {
		try {
			await host.writeAppFile("crash-report.txt", text());
			setStatus("Saved in the app's settings folder as crash-report.txt");
		} catch {
			setStatus("Could not save the report");
		}
	};

	return (
		<div className="crash-report" role="dialog" aria-label="Crash report">
			<div className="crash-report-box">
				<h2>VaultOps closed unexpectedly last time</h2>
				<p>
					Your notes were saved as usual; this only shows what the app was
					doing. Nothing is sent anywhere.
				</p>
				<label>
					What were you doing?
					<textarea
						value={notes}
						onChange={(e) => setNotes(e.target.value)}
						rows={4}
						placeholder="For example: typing in a long note, then pressed Cmd+Q"
					/>
				</label>
				<h3>Last log lines</h3>
				<pre className="crash-report-log">
					{crash.logTail.trim() === "" ? "(the log was empty)" : crash.logTail}
				</pre>
				<div className="crash-report-actions">
					<button type="button" onClick={copy}>
						Copy report
					</button>
					<button type="button" onClick={save}>
						Save report
					</button>
					<button type="button" onClick={onClose}>
						Dismiss
					</button>
					<span role="status">{status}</span>
				</div>
			</div>
		</div>
	);
}
