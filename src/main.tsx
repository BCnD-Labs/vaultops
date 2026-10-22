import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AppInfo } from "./host/host";
import { tauriHost } from "./host/tauri-host";

function App() {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		tauriHost.appInfo().then(setInfo, (e: unknown) => setError(String(e)));
	}, []);

	return (
		<main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
			<h1>VaultOps</h1>
			{info && (
				<p>
					Host connected: {info.name} {info.version}
				</p>
			)}
			{error && <p>Host not reachable: {error}</p>}
		</main>
	);
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
