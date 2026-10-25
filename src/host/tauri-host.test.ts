import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOST_ERROR_CODES, HostError } from "./host";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
	invoke: (...args: unknown[]) => invoke(...args),
}));

const { tauriHost, toHostError } = await import("./tauri-host");

describe("tauriHost", () => {
	beforeEach(() => invoke.mockReset());

	it("calls the matching Rust command with its arguments", async () => {
		invoke.mockResolvedValue(undefined);
		await tauriHost.readText("a.vnote");
		await tauriHost.writeTextAtomic("a.vnote", "text");
		await tauriHost.move("a.vnote", "b/a.vnote");
		await tauriHost.list("");
		await tauriHost.makeFolder("b");
		await tauriHost.kindOf("b");
		await tauriHost.appInfo();
		expect(invoke.mock.calls).toEqual([
			["read_text", { path: "a.vnote" }],
			["write_text_atomic", { path: "a.vnote", text: "text" }],
			["move_entry", { from: "a.vnote", to: "b/a.vnote" }],
			["list", { folder: "" }],
			["make_folder", { path: "b" }],
			["kind_of", { path: "b" }],
			["app_info", undefined],
		]);
	});

	it("returns what Rust returns", async () => {
		invoke.mockResolvedValueOnce([{ name: "a.vnote", kind: "file" }]);
		expect(await tauriHost.list("")).toEqual([
			{ name: "a.vnote", kind: "file" },
		]);
		invoke.mockResolvedValueOnce(null);
		expect(await tauriHost.kindOf("missing")).toBeNull();
	});

	it("turns Rust errors into HostErrors with the same code", async () => {
		invoke.mockRejectedValueOnce({ code: "not-found", message: "not found" });
		const error = await tauriHost.readText("x").catch((e: unknown) => e);
		expect(error).toBeInstanceOf(HostError);
		expect((error as HostError).code).toBe("not-found");
		expect((error as HostError).message).toBe("not found");
	});

	it("turns anything unexpected into an io error", () => {
		for (const raw of [
			"Command read_text not allowed by ACL",
			{ code: "made-up", message: "x" },
			{ code: "io" },
			null,
		]) {
			expect(toHostError(raw).code).toBe("io");
		}
	});
});

describe("error codes", () => {
	it("match the list the Rust tests check", () => {
		const shared = JSON.parse(
			readFileSync("test-fixtures/host-error-codes.json", "utf8"),
		);
		expect([...HOST_ERROR_CODES]).toEqual(shared);
	});
});
