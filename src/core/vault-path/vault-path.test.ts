import { describe, expect, it } from "vitest";
import {
	checkFolderDepth,
	checkVaultPath,
	FOLDER_DEPTH_NOTICE,
	folderDepth,
	MAX_FOLDER_DEPTH,
	nameKey,
} from "./vault-path.js";

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

describe("folder depth", () => {
	it("is five levels below the root", () => {
		expect(MAX_FOLDER_DEPTH).toBe(5);
	});

	it("counts the parts of a folder path, and the root as zero", () => {
		expect(folderDepth("")).toBe(0);
		expect(folderDepth("A")).toBe(1);
		expect(folderDepth("A/B/C")).toBe(3);
	});

	it("accepts up to five levels and refuses six", () => {
		expect(checkFolderDepth("A/B/C/D/E")).toEqual({ ok: true });
		expect(checkFolderDepth("A/B/C/D/E/F")).toEqual({
			ok: false,
			reason: FOLDER_DEPTH_NOTICE,
		});
	});

	it("is not part of checkVaultPath, so deeper existing paths still read", () => {
		const deep = "A/B/C/D/E/F/G/H/note.vnote";
		expect(checkVaultPath(deep).ok).toBe(true);
		expect(checkVaultPath("A/B/C/D/E/F/G", { allowRoot: true }).ok).toBe(true);
	});
});
