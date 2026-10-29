import { useEffect, useState } from "react";
import { bundleReport, reportFileName } from "../core/session/report-bundle";
import type { AppFileName, Host } from "../host/host";
import type { Logger } from "./logger";
import { buildReport } from "./report";

type PanelHost = Pick<
	Host,
	| "readAppFile"
	| "readLogTail"
	| "reportsFolder"
	| "chooseReportsFolder"
	| "writeReport"
>;

function Saved({
	title,
	name,
	host,
}: {
	title: string;
	name: AppFileName;
	host: Pick<Host, "readAppFile">;
}) {
	const [text, setText] = useState<string | null | undefined>(undefined);
	const [status, setStatus] = useState<string | null>(null);
	useEffect(() => {
		host
			.readAppFile(name)
			.then(setText)
			.catch(() => setText(null));
	}, [host, name]);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text ?? "");
			setStatus("Copied");
		} catch {
			setStatus("Could not copy");
		}
	};

	return (
		<section className="maintainer-section">
			<h3>{title}</h3>
			{text === undefined && <p>Loading…</p>}
			{text === null && <p>Nothing saved.</p>}
			{typeof text === "string" && (
				<>
					<pre className="maintainer-text">{text}</pre>
					<button type="button" onClick={copy}>
						Copy
					</button>
					<span role="status"> {status}</span>
				</>
			)}
		</section>
	);
}

/** Pick a reports folder and drop a full report into it. */
function Reports({
	host,
	logger,
	app,
}: {
	host: PanelHost;
	logger: Logger;
	app: { name: string; version: string };
}) {
	const [folder, setFolder] = useState<string | null | undefined>(undefined);
	const [status, setStatus] = useState<string | null>(null);
	useEffect(() => {
		host
			.reportsFolder()
			.then(setFolder)
			.catch(() => setFolder(null));
	}, [host]);

	const choose = async () => {
		try {
			const name = await host.chooseReportsFolder();
			if (name !== null) {
				setFolder(name);
				setStatus(null);
			}
		} catch {
			setStatus("Could not use that folder");
		}
	};

	const send = async () => {
		try {
			const [logTail, crash] = await Promise.all([
				host.readLogTail(200),
				host.readAppFile("crash-report.txt"),
			]);
			const now = new Date();
			const name = reportFileName(now);
			await host.writeReport(
				name,
				bundleReport({
					debug: buildReport(logger, {
						app,
						environment: navigator.userAgent,
						now: now.getTime(),
					}),
					logTail,
					crash,
				}),
			);
			setStatus(`Saved ${name}`);
		} catch {
			setStatus("Could not save the report. Choose the folder again.");
		}
	};

	return (
		<section className="maintainer-section">
			<h3>Reports folder</h3>
			<p>
				{folder === undefined
					? "Loading…"
					: folder === null
						? "No folder chosen yet."
						: `Reports go to the folder "${folder}".`}
			</p>
			<div className="crash-report-actions">
				<button type="button" onClick={choose}>
					{folder ? "Change folder…" : "Choose folder…"}
				</button>
				<button type="button" onClick={send} disabled={!folder}>
					Send report now
				</button>
				<span role="status">{status}</span>
			</div>
			<p>
				Reports hold the log and debug details, never the text of your notes.
			</p>
		</section>
	);
}

/**
 * Maintainer-only tools (shown only when the maintainer switch file exists):
 * a reports folder, the debug panel, the last saved crash report and any text
 * kept at quit.
 */
export function MaintainerPanel({
	host,
	logger,
	app,
	onOpenDebug,
	onClose,
}: {
	host: PanelHost;
	logger: Logger;
	app: { name: string; version: string };
	onOpenDebug: () => void;
	onClose: () => void;
}) {
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="crash-report" role="dialog" aria-label="Maintainer tools">
			<div className="crash-report-box">
				<h2>Maintainer tools</h2>
				<div className="crash-report-actions">
					<button type="button" onClick={onOpenDebug}>
						Open debug panel
					</button>
					<button type="button" onClick={onClose}>
						Close
					</button>
				</div>
				<Reports host={host} logger={logger} app={app} />
				<Saved
					title="Last saved crash report"
					name="crash-report.txt"
					host={host}
				/>
				<Saved
					title="Unsaved text kept at the last quit"
					name="unsaved-recovery.txt"
					host={host}
				/>
			</div>
		</div>
	);
}
