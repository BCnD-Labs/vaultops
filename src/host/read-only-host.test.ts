import { describe, expect, it, vi } from "vitest";
import type { Host } from "./host";
import { HostError } from "./host";
import { MemoryHost } from "./memory-host";
import { READ_ONLY_VAULT_MESSAGE, readOnlyHost } from "./read-only-host";

describe("readOnlyHost", () => {
	it("refuses every write to the vault with a clear error and changes nothing", async () => {
		const inner = new MemoryHost();
		await inner.makeFolder("Class");
		await inner.writeTextAtomic("Class/a.vnote", "A");
		const host = readOnlyHost(inner);

		const refused = [
			host.writeTextAtomic("Class/a.vnote", "B"),
			host.writeTextAtomic("new.vnote", "B"),
			host.move("Class/a.vnote", "b.vnote"),
			host.makeFolder("Other"),
			host.removeTrashed(".vaultops/trash/t/a.vnote"),
		];
		for (const call of refused) {
			await expect(call).rejects.toMatchObject({
				name: "HostError",
				code: "io",
				message: READ_ONLY_VAULT_MESSAGE,
			});
			await expect(call).rejects.toBeInstanceOf(HostError);
		}
		expect(await inner.readText("Class/a.vnote")).toBe("A");
		expect((await inner.list("")).map((e) => e.name)).toEqual(["Class"]);
	});

	it("still reads, and still writes the app's own files, log and reports", async () => {
		const inner = new MemoryHost();
		await inner.writeTextAtomic("a.vnote", "A");
		const host = readOnlyHost(inner);

		expect(await host.readText("a.vnote")).toBe("A");
		expect(await host.list("")).toEqual([{ name: "a.vnote", kind: "file" }]);
		expect(await host.kindOf("a.vnote")).toBe("file");
		expect(await host.currentVault()).toBe("Memory vault");

		await host.appendLog("line\n");
		await host.writeAppFile("session.json", "{}");
		await host.chooseReportsFolder();
		await host.writeReport("r.txt", "report");
		expect(inner.logLines).toEqual(["line\n"]);
		expect(await inner.readAppFile("session.json")).toBe("{}");
		expect(inner.reports.get("r.txt")).toBe("report");
	});
});

describe("readOnlyHost pass-through", () => {
	it("hands every non-vault call to the real host, with its arguments and result", async () => {
		const calls: [string, unknown[]][] = [];
		const record =
			(name: string, result: unknown) =>
			(...args: unknown[]) => {
				calls.push([name, args]);
				return Promise.resolve(result);
			};
		const unlisten = () => {};
		const inner = {
			appInfo: record("appInfo", { name: "n", version: "1" }),
			chooseVault: record("chooseVault", "Vault"),
			currentVault: record("currentVault", "Vault"),
			readText: record("readText", "text"),
			list: record("list", []),
			kindOf: record("kindOf", "file"),
			onCloseRequested: (handler: () => Promise<boolean>) => {
				calls.push(["onCloseRequested", [handler]]);
				return Promise.resolve(unlisten);
			},
			readAppFile: record("readAppFile", null),
			readLogTail: record("readLogTail", "tail"),
			reportsFolder: record("reportsFolder", "Reports"),
			chooseReportsFolder: record("chooseReportsFolder", "Reports"),
			appendLog: record("appendLog", undefined),
			writeAppFile: record("writeAppFile", undefined),
			writeReport: record("writeReport", undefined),
			startUpdateScript: record("startUpdateScript", undefined),
			updateScriptStatus: record("updateScriptStatus", {
				state: "idle",
				lastLine: "",
			}),
			writeTextAtomic: record("writeTextAtomic", undefined),
			move: record("move", undefined),
			makeFolder: record("makeFolder", undefined),
			removeTrashed: record("removeTrashed", undefined),
		} as unknown as Host;
		const host = readOnlyHost(inner);
		const handler = async () => true;

		expect(await host.appInfo()).toEqual({ name: "n", version: "1" });
		expect(await host.chooseVault()).toBe("Vault");
		expect(await host.currentVault()).toBe("Vault");
		expect(await host.readText("a")).toBe("text");
		expect(await host.list("f")).toEqual([]);
		expect(await host.kindOf("a")).toBe("file");
		expect(await host.onCloseRequested(handler)).toBe(unlisten);
		expect(await host.readAppFile("session.json")).toBeNull();
		expect(await host.readLogTail(5)).toBe("tail");
		expect(await host.reportsFolder()).toBe("Reports");
		expect(await host.chooseReportsFolder()).toBe("Reports");
		await host.appendLog("l");
		await host.writeAppFile("session.json", "{}");
		await host.writeReport("r.txt", "t");
		await host.startUpdateScript();
		expect(await host.updateScriptStatus()).toEqual({
			state: "idle",
			lastLine: "",
		});

		expect(calls).toEqual([
			["appInfo", []],
			["chooseVault", []],
			["currentVault", []],
			["readText", ["a"]],
			["list", ["f"]],
			["kindOf", ["a"]],
			["onCloseRequested", [handler]],
			["readAppFile", ["session.json"]],
			["readLogTail", [5]],
			["reportsFolder", []],
			["chooseReportsFolder", []],
			["appendLog", ["l"]],
			["writeAppFile", ["session.json", "{}"]],
			["writeReport", ["r.txt", "t"]],
			["startUpdateScript", []],
			["updateScriptStatus", []],
		]);
	});

	it("never reaches the real host for a write, even with unusual arguments", async () => {
		const touched = vi.fn();
		const inner = new Proxy({} as Host, {
			get: (_t, name) => (name === "then" ? undefined : touched),
		});
		const host = readOnlyHost(inner);
		await expect(host.writeTextAtomic("", "")).rejects.toBeInstanceOf(
			HostError,
		);
		await expect(host.move("..", "/etc")).rejects.toBeInstanceOf(HostError);
		await expect(host.makeFolder("a/b/c")).rejects.toBeInstanceOf(HostError);
		await expect(host.removeTrashed("x")).rejects.toBeInstanceOf(HostError);
		expect(touched).not.toHaveBeenCalled();
	});

	it("refuses with a rejected promise, not a thrown error", () => {
		const host = readOnlyHost(new MemoryHost());
		const result = host.makeFolder("x");
		expect(result).toBeInstanceOf(Promise);
		return expect(result).rejects.toBeDefined();
	});
});
