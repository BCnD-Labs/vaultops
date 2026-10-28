import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import {
	checkPreviousSession,
	markCleanExit,
	markCleanOnClose,
	type PreviousCrash,
} from "./app/session-marker";
import { CrashReport } from "./debug/CrashReport";
import { installErrorCapture } from "./debug/capture";
import { ErrorBoundary } from "./debug/ErrorBoundary";
import { setLogger } from "./debug/index";
import { createLogger } from "./debug/logger";
import { loggingHost } from "./debug/logging-host";
import { tauriHost } from "./host/tauri-host";

// Record what the app does (never note text) in the app's own log file.
const logger = createLogger({ sink: (lines) => tauriHost.appendLog(lines) });
setLogger(logger);
installErrorCapture(logger);
const baseHost = loggingHost(tauriHost, logger);
const host = markCleanOnClose(baseHost);
logger.log({ kind: "app", name: "start" });
void host
	.appInfo()
	.then((info) =>
		logger.log({
			kind: "app",
			name: "info",
			detail: { name: info.name, version: info.version },
		}),
	)
	.catch(() => {});
window.addEventListener("beforeunload", () => {
	void logger.flush();
	// A reload keeps the process alive; a real quit records this in the close handler.
	void markCleanExit(baseHost);
});

// Looked at once, before anything renders (StrictMode would run an effect twice).
const previousRun: Promise<PreviousCrash | null> = baseHost
	.appInfo()
	.then((info) => checkPreviousSession(baseHost, info.version))
	.catch(() => null);

function Root() {
	const [crash, setCrash] = useState<PreviousCrash | null>(null);
	useEffect(() => {
		let live = true;
		void previousRun.then((found) => {
			if (live) setCrash(found);
		});
		return () => {
			live = false;
		};
	}, []);
	return (
		<>
			{crash && (
				<CrashReport
					crash={crash}
					host={baseHost}
					onClose={() => setCrash(null)}
				/>
			)}
			<App host={host} />
		</>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
	<StrictMode>
		<ErrorBoundary logger={logger}>
			<Root />
		</ErrorBoundary>
	</StrictMode>,
);
