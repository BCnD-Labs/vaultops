import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildCommit } from "./build-info";

it("has no build commit in unit tests, where nothing sets it", () => {
	expect(buildCommit).toBeNull();
});

it("is set from the git commit by the vite config, for the real build", () => {
	const config = readFileSync(
		new URL("../../vite.config.ts", import.meta.url),
		"utf8",
	);
	expect(config).toContain('"rev-parse", "--short", "HEAD"');
	expect(config).toMatch(/define:\s*\{\s*__BUILD_COMMIT__:/);
});
