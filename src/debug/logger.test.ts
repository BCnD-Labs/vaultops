import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { installErrorCapture } from "./capture";
import { createLogger } from "./logger";
import { loggingHost } from "./logging-host";
import { buildReport } from "./report";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("logger", () => {
	it("keeps only the newest entries in memory, in order", () => {
		const log = createLogger({ capacity: 3 });
		for (const n of ["a", "b", "c", "d", "e"]) {
			log.log({ kind: "app", name: n });
		}
		expect(log.entries().map((e) => e.name)).toEqual(["c", "d", "e"]);
	});

	it("batches file writes on a timer, in order, and never throws", async () => {
		const sink = vi.fn().mockResolvedValue(undefined);
		const log = createLogger({ sink, flushMs: 1000 });
		log.log({ kind: "app", name: "one" });
		log.log({ kind: "app", name: "two" });
		expect(sink).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1000);
		expect(sink).toHaveBeenCalledTimes(1);
		const first = String(sink.mock.calls[0]?.[0] ?? "");
		const lines = first.trim().split("\n");
		expect(lines.map((l) => JSON.parse(l).name)).toEqual(["one", "two"]);
	});

	it("a failing file only bumps a counter; the app keeps going", async () => {
		const sink = vi.fn().mockRejectedValue(new Error("disk"));
		const log = createLogger({ sink, flushMs: 10 });
		log.log({ kind: "app", name: "x" });
		await vi.advanceTimersByTimeAsync(10);
		await log.flush();
		expect(log.counters()["log.write-failures"]).toBe(1);
		expect(log.entries()).toHaveLength(1);
	});

	it("drops the oldest waiting lines instead of growing when the file is stuck", async () => {
		const sink = vi.fn(() => new Promise<void>(() => {}));
		const log = createLogger({ sink, flushMs: 5, maxPending: 10 });
		for (let i = 0; i < 25; i++) log.log({ kind: "app", name: `n${i}` });
		expect(log.dropped()).toBe(15);
	});

	it("splits a large backlog into batches under the size the native side accepts", async () => {
		const sink = vi.fn().mockResolvedValue(undefined);
		const log = createLogger({ sink, flushMs: 10, maxPending: 100000 });
		const big = "x".repeat(1000);
		for (let i = 0; i < 1000; i++) {
			log.log({ kind: "app", name: "big", detail: { big } });
		}
		await vi.advanceTimersByTimeAsync(10);
		await log.flush();
		expect(sink.mock.calls.length).toBeGreaterThan(1);
		for (const [text] of sink.mock.calls) {
			expect((text as string).length).toBeLessThanOrEqual(256 * 1024);
		}
	});

	it("tracks per-call stats and counters", () => {
		const log = createLogger();
		log.log({ kind: "host", name: "readText", ms: 2, ok: true });
		log.log({ kind: "host", name: "readText", ms: 6, ok: false });
		log.count("edits", 3);
		expect(log.stats().readText).toEqual({
			count: 2,
			failures: 1,
			totalMs: 8,
			maxMs: 6,
		});
		expect(log.counters().edits).toBe(3);
	});

	it("is fast: 20,000 events cost well under a second", () => {
		vi.useRealTimers();
		const log = createLogger({ sink: async () => {} });
		const start = performance.now();
		for (let i = 0; i < 20000; i++) {
			log.log({
				kind: "host",
				name: "readText",
				ms: 1,
				ok: true,
				detail: { path: "a/b.vnote", chars: 100 },
			});
		}
		expect(performance.now() - start).toBeLessThan(1000);
	});
});

describe("loggingHost", () => {
	it("records name, time, result and path for every call, and rethrows failures", async () => {
		const log = createLogger();
		const host = loggingHost(new MemoryHost(), log);
		await host.writeTextAtomic("a.vnote", "secret note text");
		await host.readText("a.vnote");
		await expect(host.readText("missing.vnote")).rejects.toThrow();
		const calls = log.entries().filter((e) => e.kind === "host");
		expect(calls.map((c) => [c.name, c.ok])).toEqual([
			["writeTextAtomic", true],
			["readText", true],
			["readText", false],
		]);
		expect(calls[2]?.detail).toMatchObject({ code: "not-found" });
		expect(calls[0]?.detail).toMatchObject({ path: "a.vnote", chars: 16 });
	});

	it("never records note text", async () => {
		const log = createLogger();
		const host = loggingHost(new MemoryHost(), log);
		await host.writeTextAtomic("a.vnote", "TOP-SECRET-CONTENT");
		await host.readText("a.vnote");
		expect(JSON.stringify(log.entries())).not.toContain("TOP-SECRET");
	});

	it("passes results through unchanged", async () => {
		const inner = new MemoryHost();
		const host = loggingHost(inner, createLogger());
		await host.makeFolder("f");
		expect(await host.kindOf("f")).toBe("folder");
		expect((await host.list("")).map((e) => e.name)).toEqual(["f"]);
	});

	it("does not log the log write itself", async () => {
		const inner = new MemoryHost();
		const log = createLogger();
		const host = loggingHost(inner, log);
		await host.appendLog("line");
		expect(inner.logLines).toEqual(["line"]);
		expect(log.entries()).toEqual([]);
	});

	it("adds almost nothing per call", async () => {
		vi.useRealTimers();
		const inner = new MemoryHost();
		await inner.makeFolder("f");
		const host = loggingHost(inner, createLogger({ sink: async () => {} }));
		const n = 5000;
		const start = performance.now();
		for (let i = 0; i < n; i++) await host.kindOf("f");
		const perCall = (performance.now() - start) / n;
		expect(perCall).toBeLessThan(0.2);
	});
});

describe("error capture and report", () => {
	it("records uncaught errors and unhandled rejections", () => {
		const handlers = new Map<string, (e: Event) => void>();
		const target = {
			addEventListener: (t: string, h: (e: Event) => void) =>
				handlers.set(t, h),
			removeEventListener: (t: string) => handlers.delete(t),
		};
		const log = createLogger();
		const off = installErrorCapture(log, target as never);
		handlers.get("error")?.({
			error: new Error("boom"),
			message: "boom",
		} as never);
		handlers.get("unhandledrejection")?.({ reason: "nope" } as never);
		expect(log.entries().map((e) => e.name)).toEqual([
			"uncaught",
			"unhandled-rejection",
		]);
		expect(log.counters().errors).toBe(2);
		off();
		expect(handlers.size).toBe(0);
	});

	it("builds a report with counters, call stats, errors and recent events", () => {
		const log = createLogger();
		log.count("saves", 4);
		log.log({ kind: "host", name: "list", ms: 3, ok: true });
		log.log({
			kind: "error",
			name: "uncaught",
			ok: false,
			detail: { message: "x" },
		});
		const text = buildReport(log, {
			app: { name: "vaultops", version: "0.1.0" },
			environment: "test",
			now: Date.UTC(2026, 9, 28, 12, 0, 0),
		});
		expect(text).toContain("app: vaultops 0.1.0");
		expect(text).toContain("saves: 4");
		expect(text).toContain("list: 1, 0, 3.00, 3");
		expect(text).toContain("Errors and failures (1)");
		expect(text).toContain("error/uncaught");
		expect(text).toContain("2026-10-28T12:00:00.000Z");
	});
});
