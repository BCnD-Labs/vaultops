import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import {
	checkPreviousSession,
	markCleanOnClose,
	type PreviousCrash,
	pageWasReloaded,
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
const removeErrorCapture = installErrorCapture(logger);
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
// A clean quit is recorded by the close handler (markCleanOnClose), which the
// window waits for. Nothing is written here: a write started while the page is
// unloading may never run, or may land after the next page's marker.
const onBeforeUnload = () => {
	void logger.flush();
};
window.addEventListener("beforeunload", onBeforeUnload);

// Looked at once, before anything renders (StrictMode would run an effect twice).
const previousRun: Promise<PreviousCrash | null> = baseHost
	.appInfo()
	.then((info) =>
		checkPreviousSession(baseHost, info.version, new Date(), pageWasReloaded()),
	)
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
const reactRoot = createRoot(root);
reactRoot.render(
	<StrictMode>
		<ErrorBoundary logger={logger}>
			<Root />
		</ErrorBoundary>
	</StrictMode>,
);

// Hot reload re-runs this file. Without cleanup the old React root, the old
// listeners and the old logger stay alive next to the new ones, and two roots
// drawing into the same #root fail with "The object can not be found here".
import.meta.hot?.dispose(() => {
	reactRoot.unmount();
	removeErrorCapture();
	window.removeEventListener("beforeunload", onBeforeUnload);
	void logger.flush();
});
