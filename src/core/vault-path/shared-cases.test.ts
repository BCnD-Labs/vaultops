import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkVaultPath } from "./vault-path.js";

interface Case {
	path: string;
	ok: boolean;
	allowRoot?: boolean;
	parts?: string[];
}

const { cases } = JSON.parse(
	readFileSync(
		new URL("../../../test-fixtures/vault-paths.json", import.meta.url),
		"utf8",
	),
) as { cases: Case[] };

describe("shared path cases (also run by the Rust tests)", () => {
	it.each(cases)("$path → ok: $ok", (c) => {
		const result = checkVaultPath(c.path, { allowRoot: c.allowRoot ?? false });
		expect(result.ok).toBe(c.ok);
		if (result.ok && c.parts) expect(result.parts).toEqual(c.parts);
	});
});
