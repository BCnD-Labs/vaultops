import { describe, expect, it } from "vitest";
import { checkVaultPath, nameKey } from "./vault-path.js";

describe("checkVaultPath", () => {
	it("accepts normal relative paths", () => {
		const r = checkVaultPath("notes/Ideas/a b.vnote");
		expect(r).toEqual({
			ok: true,
			path: "notes/Ideas/a b.vnote",
			parts: ["notes", "Ideas", "a b.vnote"],
		});
	});

	it.each([
		["", "empty"],
		["/etc/passwd", "absolute"],
		["../x", ". or .."],
		["a/../../x", ". or .."],
		["a/./b", ". or .."],
		["a//b", "empty part"],
		["a/", "empty part"],
		["a\\b", "backslash"],
		["a\u0000b", "control"],
		["a\nb", "control"],
		[`${"x".repeat(256)}`, "255 bytes"],
		[`${"é".repeat(128)}`, "255 bytes"],
		[".git/hooks/pre-commit", ".git folder"],
		["sub/.GIT/config", ".git folder"],
	])("rejects %j (%s)", (path, why) => {
		const r = checkVaultPath(path);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain(why);
	});

	it("allows the root only when asked", () => {
		expect(checkVaultPath("", { allowRoot: true })).toEqual({
			ok: true,
			path: "",
			parts: [],
		});
	});

	it("accepts dotfiles that are not . or ..", () => {
		expect(checkVaultPath(".vaultops/config.json").ok).toBe(true);
		expect(checkVaultPath(".gitignore").ok).toBe(true);
	});
});

describe("nameKey", () => {
	it("treats capital letters as the same name", () => {
		expect(nameKey("Note.vnote")).toBe(nameKey("note.VNOTE"));
	});

	it("treats é typed two ways as the same name", () => {
		expect(nameKey("café")).toBe(nameKey("café"));
	});

	it("keeps different names apart", () => {
		expect(nameKey("note-1")).not.toBe(nameKey("note-2"));
	});
});
