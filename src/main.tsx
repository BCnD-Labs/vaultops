import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
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
const host = loggingHost(tauriHost, logger);
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
window.addEventListener("beforeunload", () => void logger.flush());

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
	<StrictMode>
		<ErrorBoundary logger={logger}>
			<App host={host} />
		</ErrorBoundary>
	</StrictMode>,
);
