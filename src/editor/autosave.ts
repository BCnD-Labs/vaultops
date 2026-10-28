/** What a save reports: either it worked, or why not (in plain words). */
export type SaveResult = { ok: true } | { ok: false; message: string };

export type AutosaveState =
	| { kind: "saved" }
	| { kind: "dirty" }
	| { kind: "saving" }
	| { kind: "failed"; reason: string };

export interface AutosaveOptions<T> {
	/** Writes the document; must resolve (not throw) with the outcome. A throw counts as a failure. */
	save: (value: T) => Promise<SaveResult>;
	/** Quiet time after the last edit before saving. */
	delayMs?: number;
	/** Waits before automatic retries after a failure; the last one repeats. */
	retryDelaysMs?: number[];
}

export interface Autosave<T> {
	/** Remember the latest value and save it after the quiet time. */
	change(value: T): void;
	/** Save now if anything is unsaved. Resolves true when everything is saved. */
	flush(): Promise<boolean>;
	/** Try again right away after a failure. */
	retry(): Promise<boolean>;
	getState(): AutosaveState;
	subscribe(listener: (state: AutosaveState) => void): () => void;
	/** Stop timers (the unsaved document stays unsaved: flush first). */
	dispose(): void;
}

const SAVED: AutosaveState = { kind: "saved" };
const DIRTY: AutosaveState = { kind: "dirty" };
const SAVING: AutosaveState = { kind: "saving" };

/**
 * Debounced saving that never discards an edit. The latest document is kept in
 * memory until a save of it (or of something newer) succeeds; a failed save
 * leaves the "failed" state in place and retries by itself.
 */
export function createAutosave<T>(options: AutosaveOptions<T>): Autosave<T> {
	const delayMs = options.delayMs ?? 650;
	const retryDelays = options.retryDelaysMs ?? [2000, 5000, 15000, 30000];

	let state: AutosaveState = SAVED;
	let pending: T | null = null;
	let draining: Promise<boolean> | null = null;
	let failures = 0;
	let debounce: ReturnType<typeof setTimeout> | undefined;
	let retryTimer: ReturnType<typeof setTimeout> | undefined;
	const listeners = new Set<(state: AutosaveState) => void>();

	function setState(next: AutosaveState): void {
		state = next;
		for (const listener of [...listeners]) listener(state);
	}

	function clearTimers(): void {
		clearTimeout(debounce);
		clearTimeout(retryTimer);
		debounce = undefined;
		retryTimer = undefined;
	}

	function scheduleRetry(): void {
		clearTimeout(retryTimer);
		const wait = retryDelays[Math.min(failures - 1, retryDelays.length - 1)];
		retryTimer = setTimeout(() => void drain(), wait ?? 30000);
	}

	function drain(): Promise<boolean> {
		if (draining) return draining;
		draining = (async () => {
			clearTimers();
			let ok = true;
			while (pending !== null) {
				const doc = pending;
				pending = null;
				setState(SAVING);
				let outcome: SaveResult;
				try {
					outcome = await options.save(doc);
				} catch (error) {
					outcome = {
						ok: false,
						message: error instanceof Error ? error.message : String(error),
					};
				}
				if (outcome.ok) {
					failures = 0;
					ok = true;
					if (pending === null) setState(SAVED);
					continue;
				}
				// Keep the edit: a newer document, if one arrived meanwhile, replaces it.
				pending ??= doc;
				failures += 1;
				ok = false;
				setState({ kind: "failed", reason: outcome.message });
				scheduleRetry();
				break;
			}
			return ok;
		})().finally(() => {
			draining = null;
		});
		return draining;
	}

	async function flush(): Promise<boolean> {
		clearTimeout(debounce);
		debounce = undefined;
		for (;;) {
			if (draining) await draining;
			if (pending === null) return state.kind !== "failed";
			if (!(await drain())) return false;
		}
	}

	return {
		change(value) {
			pending = value;
			if (state.kind === "saved") setState(DIRTY);
			clearTimeout(debounce);
			debounce = setTimeout(() => void drain(), delayMs);
		},
		flush,
		retry() {
			clearTimeout(retryTimer);
			return flush();
		},
		getState: () => state,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		dispose: clearTimers,
	};
}
