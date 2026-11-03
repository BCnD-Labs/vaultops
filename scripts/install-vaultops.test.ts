import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Mac installer script", () => {
	it("has a bash entry point and guards against unsupported systems and unsafe deletion", () => {
		const script = readFileSync(
			new URL("./install-vaultops.sh", import.meta.url),
			"utf8",
		);
		expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
		expect(script).toContain('[ "$(uname)" = "Darwin" ]');
		expect(script).not.toMatch(/rm\s+-rf\b/);
	});
});
