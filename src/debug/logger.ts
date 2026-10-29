/** One recorded event. Never holds note text. */
export interface LogEntry {
	/** Milliseconds since 1970 (when it happened). */
	t: number;
	/** "host" (a native call), "save", "error", "app", "perf". */
	kind: string;
	name: string;
	/** How long it took, when it makes sense. */
	ms?: number;
	ok?: boolean;
	detail?: Record<string, string | number | boolean | null>;
}

export interface CallStats {
	count: number;
	failures: number;
	totalMs: number;
	maxMs: number;
}

export interface Logger {
	log(entry: Omit<LogEntry, "t">): void;
	/** Count something that happens too often to log one by one (edits, keystrokes). */
	count(name: string, by?: number): void;
	/** The newest entries kept in memory, oldest first. */
	entries(): LogEntry[];
	counters(): Record<string, number>;
	/** Per host call: how many, how many failed, average and worst time. */
	stats(): Record<string, CallStats>;
	/** Entries dropped because the file could not keep up (0 is normal). */
	dropped(): number;
	/** Write everything pending now. Never throws. */
	flush(): Promise<void>;
	/** Changes whenever anything is recorded (for screens that show the log). */
	version(): number;
	subscribe(listener: () => void): () => void;
}

export interface LoggerOptions {
	/** Where batches of lines go (the app's log file). Optional. */
	sink?: (lines: string) => Promise<void>;
	/** Entries kept in memory. */
	capacity?: number;
	/** How long lines wait to be batched into one write. */
	flushMs?: number;
	/** Most lines waiting for the file before the oldest are dropped. */
	maxPending?: number;
	now?: () => number;
}

// One write call may carry at most 256 KB; stay well under it.
const MAX_BATCH_CHARS = 200_000;

/**
 * Cheap on purpose: recording an event is one array write and one counter
 * update. Writing to the file happens later, in batches, on a timer, and is
 * never waited for. If the file is slow, the oldest waiting lines are dropped
 * rather than letting memory grow or the app wait.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
	const capacity = options.capacity ?? 2000;
	const flushMs = options.flushMs ?? 250;
	const maxPending = options.maxPending ?? 5000;
	const now = options.now ?? Date.now;

	const ring: (LogEntry | undefined)[] = new Array(capacity);
	let next = 0;
	let size = 0;
	let pending: string[] = [];
	let droppedCount = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let writing: Promise<void> = Promise.resolve();
	const counts: Record<string, number> = {};
	const callStats: Record<string, CallStats> = {};
	const listeners = new Set<() => void>();
	let notifyQueued = false;
	let changes = 0;

	function notify() {
		changes += 1;
		if (notifyQueued || listeners.size === 0) return;
		notifyQueued = true;
		queueMicrotask(() => {
			notifyQueued = false;
			for (const listener of [...listeners]) listener();
		});
	}

	function schedule() {
		if (timer !== undefined || !options.sink) return;
		timer = setTimeout(() => {
			timer = undefined;
			void flush();
		}, flushMs);
	}

	function flush(): Promise<void> {
		const sink = options.sink;
		if (!sink) return Promise.resolve();
		clearTimeout(timer);
		timer = undefined;
		if (pending.length === 0) return writing;
		const lines = pending;
		pending = [];
		// Writes go one after another so lines stay in order.
		writing = writing.then(async () => {
			let batch = "";
			const send = async (text: string) => {
				try {
					await sink(text);
				} catch {
					counts["log.write-failures"] =
						(counts["log.write-failures"] ?? 0) + 1;
				}
			};
			for (const line of lines) {
				if (batch.length + line.length + 1 > MAX_BATCH_CHARS) {
					await send(batch);
					batch = "";
				}
				batch += `${line}\n`;
			}
			if (batch) await send(batch);
		});
		return writing;
	}

	return {
		log(entry) {
			const full: LogEntry = { t: now(), ...entry };
			ring[next] = full;
			next = (next + 1) % capacity;
			if (size < capacity) size += 1;
			if (full.kind === "host" && full.ms !== undefined) {
				let s = callStats[full.name];
				if (!s) {
					s = { count: 0, failures: 0, totalMs: 0, maxMs: 0 };
					callStats[full.name] = s;
				}
				s.count += 1;
				if (full.ok === false) s.failures += 1;
				s.totalMs += full.ms;
				if (full.ms > s.maxMs) s.maxMs = full.ms;
			}
			if (options.sink) {
				pending.push(JSON.stringify(full));
				if (pending.length > maxPending) {
					const over = pending.length - maxPending;
					pending.splice(0, over);
					droppedCount += over;
				}
				// Errors are what a crash report needs most: write them right away.
				if (full.kind === "error") void flush();
				else schedule();
			}
			notify();
		},
		count(name, by = 1) {
			counts[name] = (counts[name] ?? 0) + by;
			notify();
		},
		entries() {
			const out: LogEntry[] = [];
			const start = size < capacity ? 0 : next;
			for (let i = 0; i < size; i++) {
				const e = ring[(start + i) % capacity];
				if (e) out.push(e);
			}
			return out;
		},
		counters: () => ({ ...counts }),
		stats: () =>
			Object.fromEntries(
				Object.entries(callStats).map(([k, v]) => [k, { ...v }]),
			),
		dropped: () => droppedCount,
		version: () => changes,
		flush,
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
