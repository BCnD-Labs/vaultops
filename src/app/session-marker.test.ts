import { describe, expect, it } from "vitest";
import { MemoryHost } from "../host/memory-host";
import {
	checkPreviousSession,
	markCleanExit,
	markCleanOnClose,
} from "./session-marker";

describe("checkPreviousSession", () => {
	it("finds no crash on the very first start", async () => {
		const host = new MemoryHost();
		expect(await checkPreviousSession(host, "0.1.0")).toBeNull();
		expect(await host.readAppFile("session.json")).toContain('"running"');
	});

	it("finds no crash after a clean exit", async () => {
		const host = new MemoryHost();
		await checkPreviousSession(host, "0.1.0");
		await markCleanExit(host);
		expect(await checkPreviousSession(host, "0.1.0")).toBeNull();
	});

	it("reports a crash with the last log lines when the run never exited", async () => {
		const host = new MemoryHost();
		await host.appendLog("a\nb\nc");
		await checkPreviousSession(host, "0.1.0", new Date("2026-10-28T10:00:00Z"));
		const crash = await checkPreviousSession(host, "0.2.0");
		expect(crash).toEqual({
			startedAt: "2026-10-28T10:00:00.000Z",
			version: "0.1.0",
			logTail: "a\nb\nc",
		});
		// The new run is now the running one.
		expect(await host.readAppFile("session.json")).toContain('"0.2.0"');
	});

	it("reports each crash only once", async () => {
		const host = new MemoryHost();
		await checkPreviousSession(host, "0.1.0");
		expect(await checkPreviousSession(host, "0.1.0")).not.toBeNull();
		await markCleanExit(host);
		expect(await checkPreviousSession(host, "0.1.0")).toBeNull();
	});

	it("gives no report and does not throw when the app's files fail", async () => {
		const host = new MemoryHost();
		host.readAppFile = async () => {
			throw new Error("no");
		};
		host.writeAppFile = async () => {
			throw new Error("no");
		};
		expect(await checkPreviousSession(host, "0.1.0")).toBeNull();
		await expect(markCleanExit(host)).resolves.toBeUndefined();
	});
});

describe("markCleanOnClose", () => {
	it("records a clean exit when the close is allowed", async () => {
		const host = new MemoryHost();
		await checkPreviousSession(host, "0.1.0");
		const wrapped = markCleanOnClose(host);
		await wrapped.onCloseRequested(async () => true);
		expect(await host.simulateClose()).toBe(true);
		expect(await host.readAppFile("session.json")).toContain('"clean"');
	});

	it("keeps the running marker when the close is refused", async () => {
		const host = new MemoryHost();
		await checkPreviousSession(host, "0.1.0");
		const wrapped = markCleanOnClose(host);
		await wrapped.onCloseRequested(async () => false);
		expect(await host.simulateClose()).toBe(false);
		expect(await host.readAppFile("session.json")).toContain('"running"');
	});
});
