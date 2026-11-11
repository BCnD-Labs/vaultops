import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

function readJson(file: string): Record<string, unknown> {
	const url = new URL(`../../src-tauri/${file}`, import.meta.url);
	return JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>;
}

const conf = readJson("tauri.conf.json") as {
	plugins?: { updater?: { pubkey?: string; endpoints?: string[] } };
	bundle?: Record<string, unknown>;
};
const capability = readJson("capabilities/default.json") as {
	permissions: string[];
};

it("checks for updates only on this repo's GitHub Releases, over https", () => {
	const updater = conf.plugins?.updater;
	expect(updater?.endpoints).toEqual([
		"https://github.com/BCnD-Labs/vaultops/releases/latest/download/latest.json",
	]);
	// The public key is base64 of a minisign public key file (never the private key).
	const decoded = Buffer.from(updater?.pubkey ?? "", "base64").toString("utf8");
	expect(decoded.startsWith("untrusted comment: minisign public key")).toBe(
		true,
	);
	expect(decoded).not.toMatch(/secret key/i);
});

it("keeps updater artifacts out of the base config so a plain build needs no signing key", () => {
	expect(conf.bundle).not.toHaveProperty("createUpdaterArtifacts");
	const overlay = readJson("tauri.updater.conf.json") as {
		bundle?: { createUpdaterArtifacts?: boolean };
	};
	expect(overlay.bundle?.createUpdaterArtifacts).toBe(true);
});

it("grants the page only the update permissions it needs", () => {
	const granted = capability.permissions.filter(
		(p) => p.startsWith("updater:") || p.startsWith("process:"),
	);
	expect(granted.sort()).toEqual([
		"process:allow-restart",
		"updater:allow-check",
		"updater:allow-download",
		"updater:allow-install",
	]);
});

it("keeps the page itself off the network", () => {
	const csp = (
		conf as { app?: { security?: { csp?: Record<string, string> } } }
	).app?.security?.csp;
	expect(csp?.["connect-src"]).toBe("'self' ipc: http://ipc.localhost");
});
