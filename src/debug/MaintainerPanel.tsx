import { useEffect, useState } from "react";
import type { AppFileName, Host } from "../host/host";

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

/**
 * Maintainer-only tools (shown only when the maintainer switch file exists):
 * the debug panel, the last saved crash report and any text kept at quit.
 */
export function MaintainerPanel({
	host,
	onOpenDebug,
	onClose,
}: {
	host: Pick<Host, "readAppFile">;
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
