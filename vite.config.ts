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
	// The app's content security policy allows fonts only from 'self', so a font
	// must never be inlined into the CSS as a data: URI, however small (MathLive's
	// smallest font is under Vite's default 4 kB limit).
	build: {
		assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
		watch: { ignored: ["**/src-tauri/**"] },
	},
});
