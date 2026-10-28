import type { Logger } from "./logger";

const clip = (text: string, max = 600) =>
	text.length > max ? `${text.slice(0, max)}…` : text;

function describeError(error: unknown): { message: string; stack: string } {
	if (error instanceof Error) {
		return { message: clip(error.message), stack: clip(error.stack ?? "") };
	}
	return { message: clip(String(error)), stack: "" };
}

/**
 * Record uncaught errors and unhandled promise failures, which are otherwise
 * invisible in the packaged app. Returns a function that removes the handlers.
 */
export function installErrorCapture(
	logger: Logger,
	target: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): () => void {
	const onError = (event: Event) => {
		const e = event as ErrorEvent;
		const info = describeError(e.error ?? e.message);
		logger.log({
			kind: "error",
			name: "uncaught",
			ok: false,
			detail: { message: info.message, stack: info.stack },
		});
		logger.count("errors");
	};
	const onRejection = (event: Event) => {
		const info = describeError((event as PromiseRejectionEvent).reason);
		logger.log({
			kind: "error",
			name: "unhandled-rejection",
			ok: false,
			detail: { message: info.message, stack: info.stack },
		});
		logger.count("errors");
	};
	target.addEventListener("error", onError);
	target.addEventListener("unhandledrejection", onRejection);
	return () => {
		target.removeEventListener("error", onError);
		target.removeEventListener("unhandledrejection", onRejection);
	};
}
