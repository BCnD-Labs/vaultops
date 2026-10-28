import type { Host } from "../host/host";
import type { Logger } from "./logger";

type Detail = Record<string, string | number | boolean | null>;

/** What to record about a call: paths and sizes, never note text. */
function describe(name: string, args: unknown[], result: unknown): Detail {
	const detail: Detail = {};
	if (typeof args[0] === "string" && name !== "writeTextAtomic") {
		detail.path = args[0];
	}
	if (name === "writeTextAtomic") {
		detail.path = String(args[0]);
		detail.chars = typeof args[1] === "string" ? args[1].length : null;
	}
	if (name === "move") detail.to = String(args[1]);
	if (name === "readText" && typeof result === "string") {
		detail.chars = result.length;
	}
	if (name === "list" && Array.isArray(result)) detail.entries = result.length;
	if (name === "kindOf")
		detail.kind = typeof result === "string" ? result : null;
	if (name === "chooseVault" || name === "currentVault") {
		detail.opened = result !== null;
	}
	return detail;
}

/**
 * The same host, recording every call (name, time taken, worked or failed with
 * its error code, path and size). One place sees every native call because all
 * of them go through `Host`. Adds one clock read and one array write per call.
 */
export function loggingHost(host: Host, logger: Logger): Host {
	const timed =
		<A extends unknown[], R>(
			name: string,
			fn: (...args: A) => Promise<R>,
		): ((...args: A) => Promise<R>) =>
		async (...args) => {
			const start = performance.now();
			try {
				const result = await fn(...args);
				logger.log({
					kind: "host",
					name,
					ms: Math.round((performance.now() - start) * 100) / 100,
					ok: true,
					detail: describe(name, args, result),
				});
				return result;
			} catch (error) {
				const code =
					typeof error === "object" && error !== null && "code" in error
						? String((error as { code: unknown }).code)
						: "error";
				logger.log({
					kind: "host",
					name,
					ms: Math.round((performance.now() - start) * 100) / 100,
					ok: false,
					detail: { ...describe(name, args, undefined), code },
				});
				throw error;
			}
		};

	return {
		appInfo: timed("appInfo", () => host.appInfo()),
		chooseVault: timed("chooseVault", () => host.chooseVault()),
		currentVault: timed("currentVault", () => host.currentVault()),
		readText: timed("readText", (p: string) => host.readText(p)),
		writeTextAtomic: timed("writeTextAtomic", (p: string, t: string) =>
			host.writeTextAtomic(p, t),
		),
		move: timed("move", (a: string, b: string) => host.move(a, b)),
		list: timed("list", (f: string) => host.list(f)),
		makeFolder: timed("makeFolder", (p: string) => host.makeFolder(p)),
		kindOf: timed("kindOf", (p: string) => host.kindOf(p)),
		onCloseRequested: async (handler) => {
			logger.log({ kind: "app", name: "close-handler-registered" });
			return host.onCloseRequested(async () => {
				const start = performance.now();
				const allowed = await handler();
				logger.log({
					kind: "app",
					name: "close-requested",
					ms: Math.round(performance.now() - start),
					ok: allowed,
				});
				await logger.flush();
				return allowed;
			});
		},
		// Not wrapped: logging the log write would never stop.
		appendLog: (lines) => host.appendLog(lines),
	};
}
