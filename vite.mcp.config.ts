import { defineConfig } from "vite";

export default defineConfig({
	publicDir: false,
	ssr: { noExternal: true },
	build: {
		ssr: "src/mcp/server.ts",
		target: "node22",
		outDir: "dist-mcp",
		rolldownOptions: { output: { entryFileNames: "server.mjs" } },
	},
});
