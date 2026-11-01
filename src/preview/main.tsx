import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "../app/App";
import { seedVault } from "./seed";

const element = document.getElementById("root");
if (!element) throw new Error("Missing #root element");
const root = createRoot(element);
let disposed = false;

void seedVault()
	.then((host) => {
		if (!disposed) {
			root.render(
				<StrictMode>
					<App host={host} />
				</StrictMode>,
			);
		}
	})
	.catch((error: unknown) => {
		if (!disposed)
			element.textContent = `Could not seed preview: ${String(error)}`;
	});

import.meta.hot?.dispose(() => {
	disposed = true;
	root.unmount();
});
