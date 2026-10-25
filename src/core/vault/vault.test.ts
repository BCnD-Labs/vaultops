import { describe, expect, it, vi } from "vitest";
import { HostError } from "../../host/host";
import { MemoryHost } from "../../host/memory-host";
import { isInsideVaultOps, openVault, VAULT_FORMAT_VERSION } from "./vault";

const folders = ["pending", "history", "archive", "trash", "index"];
const configPath = ".vaultops/config.json";
const configText = '{"formatVersion": 1}\n';

async function existingVault(text = configText, complete = true) {
	const host = new MemoryHost();
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(configPath, text);
	if (complete) {
		for (const folder of folders) await host.makeFolder(`.vaultops/${folder}`);
	}
	return host;
}

function watchWrites(host: MemoryHost) {
	return {
		write: vi.spyOn(host, "writeTextAtomic"),
		mkdir: vi.spyOn(host, "makeFolder"),
		move: vi.spyOn(host, "move"),
	};
}

function expectNoWrites(spies: ReturnType<typeof watchWrites>) {
	expect(spies.write).not.toHaveBeenCalled();
	expect(spies.mkdir).not.toHaveBeenCalled();
	expect(spies.move).not.toHaveBeenCalled();
}

describe("openVault", () => {
	it("creates exactly the config and five empty folders in an empty root", async () => {
		const host = new MemoryHost();
		expect(VAULT_FORMAT_VERSION).toBe(1);
		expect(await openVault(host)).toEqual({
			status: "created",
			warnings: [],
			problems: [],
		});
		expect(await host.list("")).toEqual([
			{ name: ".vaultops", kind: "folder" },
		]);
		expect(await host.list(".vaultops")).toEqual([
			{ name: "archive", kind: "folder" },
			{ name: "config.json", kind: "file" },
			{ name: "history", kind: "folder" },
			{ name: "index", kind: "folder" },
			{ name: "pending", kind: "folder" },
			{ name: "trash", kind: "folder" },
		]);
		expect(await host.readText(configPath)).toBe(configText);
		for (const folder of folders)
			expect(await host.list(`.vaultops/${folder}`)).toEqual([]);
	});

	it.each([".DS_Store", ".localized", "._metadata"])(
		"creates a vault alongside the system file %s without changing it",
		async (name) => {
			const host = new MemoryHost();
			await host.writeTextAtomic(name, "system metadata");
			expect((await openVault(host)).status).toBe("created");
			expect(await host.readText(name)).toBe("system metadata");
			expect(await host.readText(configPath)).toBe(configText);
			for (const folder of folders)
				expect(await host.list(`.vaultops/${folder}`)).toEqual([]);
			const spies = watchWrites(host);
			expect((await openVault(host)).status).toBe("opened");
			expectNoWrites(spies);
		},
	);

	it.each(["keep.txt", ".env", ".gitkeep", ".DS_Store.backup"])(
		"does not ignore the user file %s alongside system metadata",
		async (name) => {
			const host = new MemoryHost();
			await host.writeTextAtomic(".DS_Store", "system metadata");
			await host.writeTextAtomic(name, "user data");
			const spies = watchWrites(host);
			expect((await openVault(host)).status).toBe("not-a-vault");
			expectNoWrites(spies);
			expect(await host.readText(name)).toBe("user data");
		},
	);

	it.each([".DS_Store", ".localized", "._metadata", "notes"])(
		"does not ignore a folder named %s",
		async (name) => {
			const host = new MemoryHost();
			await host.makeFolder(name);
			const spies = watchWrites(host);
			expect((await openVault(host)).status).toBe("not-a-vault");
			expectNoWrites(spies);
		},
	);

	it("reopens an existing vault without writing, preserving its contents", async () => {
		const host = await existingVault();
		await host.writeTextAtomic(".vaultops/history/keep", "history data");
		await host.writeTextAtomic("note.vnote", "note data");
		const spies = watchWrites(host);
		expect(await openVault(host)).toEqual({
			status: "opened",
			warnings: [],
			problems: [],
		});
		expectNoWrites(spies);
		expect(await host.readText(".vaultops/history/keep")).toBe("history data");
		expect(await host.readText("note.vnote")).toBe("note data");
	});

	it("opens a newer format read-only with a warning and no writes", async () => {
		const text = '{"formatVersion": 2}\n';
		const host = await existingVault(text);
		const spies = watchWrites(host);
		const result = await openVault(host);
		expect(result.status).toBe("read-only");
		expect(result.warnings.join(" ")).toContain("newer format");
		expect(result.problems).toEqual([]);
		expectNoWrites(spies);
		expect(await host.readText(configPath)).toBe(text);
	});

	it.each([
		"{",
		"{}",
		'{"formatVersion": 0}',
		'{"formatVersion": "1"}',
		'{"formatVersion": 1.5}',
		'{"formatVersion": -1}',
		"null",
		"[]",
	])(
		"reports damaged config %s and preserves it without any writes",
		async (text) => {
			const host = await existingVault(text, false);
			const spies = watchWrites(host);
			const result = await openVault(host);
			expect(result.status).toBe("damaged");
			expect(result.problems.length).toBeGreaterThan(0);
			expectNoWrites(spies);
			expect(await host.readText(configPath)).toBe(text);
		},
	);

	it("reports an unreadable config and does not recreate missing folders", async () => {
		const host = await existingVault(configText, false);
		const spies = watchWrites(host);
		const read = vi
			.spyOn(host, "readText")
			.mockRejectedValue(new HostError("io", "cannot read file"));
		const result = await openVault(host);
		expect(result.status).toBe("damaged");
		expect(result.problems.join(" ")).toContain(configPath);
		expectNoWrites(spies);
		read.mockRestore();
		expect(await host.readText(configPath)).toBe(configText);
	});

	it("reports a missing config without creating one", async () => {
		const host = new MemoryHost();
		await host.makeFolder(".vaultops");
		const spies = watchWrites(host);
		expect((await openVault(host)).status).toBe("damaged");
		expectNoWrites(spies);
		expect(await host.list(".vaultops")).toEqual([]);
	});

	it("leaves a non-empty folder without vault metadata untouched", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("keep.txt", "keep this");
		const spies = watchWrites(host);
		expect((await openVault(host)).status).toBe("not-a-vault");
		expectNoWrites(spies);
		expect(await host.kindOf(".vaultops")).toBeNull();
		expect(await host.readText("keep.txt")).toBe("keep this");
	});

	it("recreates only missing folders, names them in warnings and preserves data", async () => {
		const host = await existingVault(configText, false);
		await host.makeFolder(".vaultops/history");
		await host.writeTextAtomic(".vaultops/history/keep", "history data");
		const spies = watchWrites(host);
		const result = await openVault(host);
		expect(result.status).toBe("opened");
		expect(result.problems).toEqual([]);
		const missing = folders.filter((folder) => folder !== "history");
		expect(result.warnings).toEqual(
			missing.map((folder) => `Recreated missing folder: .vaultops/${folder}.`),
		);
		expect(spies.mkdir.mock.calls).toEqual(
			missing.map((folder) => [`.vaultops/${folder}`]),
		);
		expect(spies.write).not.toHaveBeenCalled();
		expect(spies.move).not.toHaveBeenCalled();
		for (const folder of missing)
			expect(await host.list(`.vaultops/${folder}`)).toEqual([]);
		expect(await host.readText(".vaultops/history/keep")).toBe("history data");
		expect(await host.readText(configPath)).toBe(configText);
	});

	it("reports every missing folder in a newer vault but never creates them", async () => {
		const text = '{"formatVersion": 2}\n';
		const host = await existingVault(text, false);
		const spies = watchWrites(host);
		const result = await openVault(host);
		expect(result.status).toBe("read-only");
		for (const folder of folders) {
			expect(result.warnings).toContain(`Missing folder: .vaultops/${folder}.`);
			expect(await host.kindOf(`.vaultops/${folder}`)).toBeNull();
		}
		expectNoWrites(spies);
		expect(await host.readText(configPath)).toBe(text);
	});

	it("propagates unexpected host errors", async () => {
		const host = await existingVault();
		const error = new Error("unexpected failure");
		vi.spyOn(host, "readText").mockRejectedValue(error);
		await expect(openVault(host)).rejects.toBe(error);
	});
});

describe("isInsideVaultOps", () => {
	it.each([".vaultops", ".vaultops/config.json", ".VaultOps/x"])(
		"recognizes %s as reserved",
		(path) => expect(isInsideVaultOps(path)).toBe(true),
	);
	it.each(["notes/.vaultops-old.vnote", "vaultops/x", ".vaultops-old/x", ""])(
		"recognizes %s as outside",
		(path) => expect(isInsideVaultOps(path)).toBe(false),
	);
});
