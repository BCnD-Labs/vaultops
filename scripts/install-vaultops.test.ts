import { spawnSync } from "node:child_process";
import {
	chmodSync,
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scriptUrl = new URL("./install-vaultops.sh", import.meta.url);

describe("Mac installer script", () => {
	it("has a bash entry point and guards against unsupported systems and unsafe deletion", () => {
		const script = readFileSync(scriptUrl, "utf8");
		expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
		expect(script).toContain('[ "$(uname)" = "Darwin" ]');
		expect(script).not.toMatch(/rm\s+-rf\b/);
	});
});

// The script only runs on a Mac. These run it against a throwaway repo with a
// fake `npm` that prints what the build would see and then fails, so nothing is
// ever built or installed.
describe.skipIf(process.platform !== "darwin")("--branch", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
	});

	const git = (cwd: string, ...args: string[]) => {
		const out = spawnSync(
			"git",
			["-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
			{ cwd, encoding: "utf8" },
		);
		expect(out.status, `git ${args.join(" ")}: ${out.stderr}`).toBe(0);
		return out.stdout.trim();
	};

	/** A checkout on `main` whose `origin` has `main` and (optionally) `develop`. */
	function setup(withDevelop: boolean) {
		const root = mkdtempSync(join(tmpdir(), "vaultops-install-"));
		dirs.push(root);
		const seed = join(root, "seed");
		mkdirSync(join(seed, "scripts"), { recursive: true });
		git(seed, "init", "-q", "-b", "main");
		copyFileSync(scriptUrl, join(seed, "scripts", "install-vaultops.sh"));
		git(seed, "add", ".");
		git(seed, "commit", "-q", "-m", "main commit");
		if (withDevelop) {
			git(seed, "checkout", "-q", "-b", "develop");
			writeFileSync(join(seed, "dev.txt"), "dev");
			git(seed, "add", ".");
			git(seed, "commit", "-q", "-m", "develop commit");
			git(seed, "checkout", "-q", "main");
		}
		const origin = join(root, "origin.git");
		git(root, "clone", "-q", "--bare", "seed", origin);
		git(root, "clone", "-q", origin, "work");
		const bin = join(root, "bin");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "npm"),
			'#!/bin/sh\necho "FAKE-NPM branch=$VAULTOPS_BUILD_BRANCH"\nexit 1\n',
		);
		chmodSync(join(bin, "npm"), 0o755);
		const work = join(root, "work");
		const run = (...args: string[]) => {
			const out = spawnSync(
				"bash",
				[join(work, "scripts", "install-vaultops.sh"), ...args],
				{
					cwd: work,
					encoding: "utf8",
					env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
				},
			);
			return { code: out.status, text: `${out.stdout}${out.stderr}` };
		};
		return { work, run };
	}

	it("refuses anything but main or develop with the usage message", () => {
		const { run } = setup(true);
		for (const args of [
			["--branch"],
			["--branch", ""],
			["--branch", "Main"],
			["--branch", "main; rm"],
			["--branch", "main", "extra"],
			["--other"],
		]) {
			const result = run(...args);
			expect(result.code, args.join(" ")).not.toBe(0);
			expect(result.text).toContain("Usage:");
			expect(result.text).not.toContain("FAKE-NPM");
		}
	});

	it("refuses a folder with unsaved changes and builds nothing", () => {
		const { work, run } = setup(true);
		writeFileSync(join(work, "scratch.txt"), "mine");
		const result = run("--branch", "develop");
		expect(result.code).not.toBe(0);
		expect(result.text).toContain(
			"This folder has unsaved changes, so nothing was built.",
		);
		expect(result.text).not.toContain("FAKE-NPM");
		expect(git(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
	});

	it("builds nothing when the branch is not on the remote", () => {
		const { work, run } = setup(false);
		const result = run("--branch", "develop");
		expect(result.code).not.toBe(0);
		expect(result.text).toContain("nothing was built");
		expect(result.text).not.toContain("FAKE-NPM");
		expect(git(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
	});

	it("switches to the branch and builds it, with that branch baked in", () => {
		const { work, run } = setup(true);
		const result = run("--branch", "develop");
		expect(result.text).toContain("FAKE-NPM branch=develop");
		expect(git(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("develop");
		expect(git(work, "rev-parse", "HEAD")).toBe(
			git(work, "rev-parse", "origin/develop"),
		);
		const back = run("--branch", "main");
		expect(back.text).toContain("FAKE-NPM branch=main");
		expect(git(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
	});

	it("keeps --no-pull working on the current branch", () => {
		const { work, run } = setup(true);
		const result = run("--no-pull");
		expect(result.text).toContain("Skipping the pull");
		expect(result.text).toContain("FAKE-NPM branch=main");
		expect(git(work, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
	});
});
