import {
	mkdir,
	mkdtemp,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openNodeHost } from "./node-host";

let temp: string;
let vault: string;
beforeEach(async () => {
	temp = await mkdtemp(join(tmpdir(), "vaultops-mcp-"));
	vault = join(temp, "vault");
	await mkdir(vault);
});
afterEach(() => rm(temp, { recursive: true, force: true }));

it("reads a vault without creating anything and sees atomic replacements", async () => {
	const host = await openNodeHost(vault);
	expect(await host.list("")).toEqual([]);
	await mkdir(join(vault, "Notes"));
	await writeFile(join(vault, "Beta.vnote"), "café 日本");
	await writeFile(join(vault, "bad"), Uint8Array.of(0xff));
	await writeFile(join(vault, ".vaultops-tmp-in-progress"), "draft");
	expect(await host.list("")).toEqual([
		{ name: "Beta.vnote", kind: "file" },
		{ name: "Notes", kind: "folder" },
		{ name: "bad", kind: "file" },
	]);
	expect(await host.readText("Beta.vnote")).toBe("café 日本");
	await rename(
		join(vault, ".vaultops-tmp-in-progress"),
		join(vault, "Beta.vnote"),
	);
	expect(await host.readText("Beta.vnote")).toBe("draft");
	expect(await host.kindOf("Beta.vnote/missing")).toBeNull();
	await expect(host.readText("Notes")).rejects.toMatchObject({
		code: "is-a-folder",
	});
	await expect(host.readText("bad")).rejects.toMatchObject({ code: "io" });
	await expect(host.list("Beta.vnote")).rejects.toMatchObject({
		code: "not-a-folder",
	});
	await expect(host.readText("missing")).rejects.toMatchObject({
		code: "not-found",
	});
});

it("admits safe links but refuses escapes, Git and aliases into app data", async () => {
	await mkdir(join(vault, "Notes"));
	await mkdir(join(vault, ".git"));
	await mkdir(join(vault, ".vaultops"));
	await writeFile(join(vault, ".git", "config"), "git config");
	await writeFile(join(vault, "Notes", "one.vnote"), "inside");
	await writeFile(join(temp, "outside.vnote"), "outside");
	await symlink("Notes/one.vnote", join(vault, "local.vnote"));
	await symlink("../Notes/one.vnote", join(vault, "Notes", "also.vnote"));
	await symlink("Notes", join(vault, "alias"));
	await symlink(".", join(vault, "loop"));
	await symlink("../outside.vnote", join(vault, "outside.vnote"));
	await symlink("outside.vnote", join(vault, "chain.vnote"));
	await symlink("missing", join(vault, "dangling"));
	await symlink(join(vault, "Notes"), join(vault, "absolute"));
	await symlink(".git", join(vault, "git-alias"));
	await symlink(".vaultops", join(vault, "private-alias"));
	await symlink("../Notes", join(vault, ".vaultops", "resources"));
	const host = await openNodeHost(vault);
	expect(await host.readText("local.vnote")).toBe("inside");
	expect(await host.readText("alias/also.vnote")).toBe("inside");
	expect(await host.list("alias")).toHaveLength(2);
	expect((await host.list("")).map((entry) => entry.name)).toEqual([
		".vaultops",
		"Notes",
		"local.vnote",
	]);
	for (const path of [
		"",
		"../outside.vnote",
		"/etc/passwd",
		"C:/absolute",
		"Notes//one.vnote",
		"Notes/../Notes/one.vnote",
		"Notes\\one.vnote",
		".GiT/config",
		"git-alias/config",
		"outside.vnote",
		"chain.vnote",
		"dangling",
		"absolute/one.vnote",
		"private-alias/trash",
		".vaultops/resources/one.vnote",
	]) {
		await expect(host.readText(path)).rejects.toMatchObject({
			code: "invalid-path",
			message: "Not a safe vault-relative path.",
		});
	}
	await expect(host.list("git-alias")).rejects.toMatchObject({
		code: "invalid-path",
	});
	await expect(host.kindOf("outside.vnote")).rejects.toMatchObject({
		code: "invalid-path",
	});
});
