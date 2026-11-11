import { beforeEach, describe, expect, it, vi } from "vitest";
import { HostError } from "./host";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => invoke(...args),
}));

type CloseEvent = { preventDefault: () => void };
let closeListener: ((event: CloseEvent) => Promise<void>) | null = null;
const unlisten = vi.fn();
vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		onCloseRequested: async (
			listener: (event: CloseEvent) => Promise<void>,
		) => {
			closeListener = listener;
			return unlisten;
		},
	}),
}));

const { tauriHost, toHostError } = await import("./tauri-host");

beforeEach(() => {
	invoke.mockReset();
	unlisten.mockReset();
	closeListener = null;
});

describe("tauriHost app files, log and window", () => {
	it("sends the app-file, log and tail commands with their arguments", async () => {
		invoke.mockResolvedValue(undefined);
		await tauriHost.appendLog("a line\n");
		await tauriHost.readAppFile("session.json");
		await tauriHost.writeAppFile("session.json", "{}");
		await tauriHost.readLogTail(50);
		expect(invoke.mock.calls).toEqual([
			["append_log", { lines: "a line\n" }],
			["read_app_file", { name: "session.json" }],
			["write_app_file", { name: "session.json", text: "{}" }],
			["read_log_tail", { maxLines: 50 }],
		]);
	});

	it("returns null from readAppFile when the file does not exist yet", async () => {
		invoke.mockResolvedValueOnce(null);
		expect(await tauriHost.readAppFile("session.json")).toBeNull();
	});

	it("maps a rejection from every command to a HostError", async () => {
		invoke.mockRejectedValue({ code: "invalid-path", message: "bad path" });
		const calls: Promise<unknown>[] = [
			tauriHost.appInfo(),
			tauriHost.chooseVault(),
			tauriHost.currentVault(),
			tauriHost.readText("a"),
			tauriHost.writeTextAtomic("a", "b"),
			tauriHost.move("a", "b"),
			tauriHost.list(""),
			tauriHost.makeFolder("a"),
			tauriHost.kindOf("a"),
			tauriHost.removeTrashed("a"),
			tauriHost.appendLog("x"),
			tauriHost.readAppFile("session.json"),
			tauriHost.writeAppFile("session.json", "x"),
			tauriHost.readLogTail(1),
			tauriHost.chooseReportsFolder(),
			tauriHost.reportsFolder(),
			tauriHost.writeReport("r.txt", "x"),
			tauriHost.startUpdateScript(),
			tauriHost.updateScriptStatus(),
		];
		for (const call of calls) {
			await expect(call).rejects.toBeInstanceOf(HostError);
			await expect(call).rejects.toMatchObject({
				code: "invalid-path",
				message: "bad path",
			});
		}
	});

	it("never leaks an unexpected native message", async () => {
		invoke.mockRejectedValueOnce("/Users/someone/secret/place failed");
		const error = (await tauriHost.readText("a").catch((e) => e)) as HostError;
		expect(error.code).toBe("io");
		expect(error.message).not.toContain("someone");
	});
});

describe("onCloseRequested", () => {
	it("lets the window close when the handler says yes", async () => {
		await tauriHost.onCloseRequested(async () => true);
		const preventDefault = vi.fn();
		await closeListener?.({ preventDefault });
		expect(preventDefault).not.toHaveBeenCalled();
	});

	it("keeps the window open when the handler says no", async () => {
		await tauriHost.onCloseRequested(async () => false);
		const preventDefault = vi.fn();
		await closeListener?.({ preventDefault });
		expect(preventDefault).toHaveBeenCalledTimes(1);
	});

	it("waits for the handler before deciding", async () => {
		let finish: (v: boolean) => void = () => {};
		await tauriHost.onCloseRequested(
			() => new Promise<boolean>((resolve) => (finish = resolve)),
		);
		const preventDefault = vi.fn();
		const pending = closeListener?.({ preventDefault });
		await Promise.resolve();
		expect(preventDefault).not.toHaveBeenCalled();
		finish(false);
		await pending;
		expect(preventDefault).toHaveBeenCalledTimes(1);
	});

	it("returns the function that removes the listener", async () => {
		const remove = await tauriHost.onCloseRequested(async () => true);
		remove();
		expect(unlisten).toHaveBeenCalledTimes(1);
	});
});

describe("toHostError", () => {
	it("passes a HostError through unchanged", () => {
		const original = new HostError("not-found", "gone");
		expect(toHostError(original)).toBe(original);
	});

	it("treats a plain Error, a number and a non-string message as io", () => {
		for (const raw of [
			new Error("boom"),
			42,
			undefined,
			{ code: "io", message: 7 },
		]) {
			const error = toHostError(raw);
			expect(error.code).toBe("io");
			expect(error.message).toBe("the app's native side could not do that");
		}
	});

	it("keeps each known code", () => {
		for (const code of [
			"not-found",
			"already-exists",
			"not-a-folder",
			"is-a-folder",
			"invalid-path",
			"io",
		]) {
			expect(toHostError({ code, message: "m" }).code).toBe(code);
		}
	});
});
