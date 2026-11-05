import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

/** The short commit this build comes from, or "unknown" outside a git checkout. */
function buildCommit(): string {
	try {
		return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "unknown";
	}
}

// Settings Tauri expects: a fixed port, Rust errors kept on screen,
// and src-tauri left out of Vite's file watching.
export default defineConfig({
	plugins: [react(), tailwindcss()],
	define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) },
	resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
		watch: { ignored: ["**/src-tauri/**"] },
	},
});
