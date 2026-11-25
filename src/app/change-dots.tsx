import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Host } from "../host/host";

/** Paths changed since the last save point (empty when history is off). */
export const ChangedPaths = createContext<ReadonlySet<string>>(new Set());

const HISTORY_CHANGED = "vaultops:history-changed";

/** Tell the dots to look again now (after a save point, switch, merge…). */
export function historyChanged(): void {
	window.dispatchEvent(new Event(HISTORY_CHANGED));
}

/** How long after the last save to ask git again. */
export const DOTS_DELAY_MS = 2000;

/** True when `path` changed, or (for a folder) anything inside it did. */
export function hasChange(
	changed: ReadonlySet<string>,
	path: string,
	folder: boolean,
): boolean {
	if (!folder) return changed.has(path);
	const prefix = `${path}/`;
	for (const p of changed) if (p.startsWith(prefix)) return true;
	return false;
}

/**
 * The vault's changed paths, read from history about two seconds after the
 * notes last changed (`savedKey` moves on every save), whenever the window
 * gets focus, and right after a history change (`historyChanged()`).
 */
export function useChangedPaths(
	host: Pick<Host, "vcs">,
	savedKey: unknown,
): ReadonlySet<string> {
	const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
		};
	}, []);
	// biome-ignore lint/correctness/useExhaustiveDependencies: savedKey is the trigger to read again after a save.
	useEffect(() => {
		const read = () =>
			void host.vcs.status().then(
				(s) => {
					if (live.current)
						setChanged(new Set(s.enabled ? s.changes.map((c) => c.path) : []));
				},
				() => {},
			);
		const timer = setTimeout(read, DOTS_DELAY_MS);
		window.addEventListener("focus", read);
		window.addEventListener(HISTORY_CHANGED, read);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("focus", read);
			window.removeEventListener(HISTORY_CHANGED, read);
		};
	}, [host, savedKey]);
	return changed;
}

/** The dot itself, with words for screen readers. */
export function ChangeDot({ folder = false }: { folder?: boolean }) {
	return (
		<span
			className="change-dot"
			role="img"
			aria-label={
				folder
					? "has changes since the last save point"
					: "changed since the last save point"
			}
			title={
				folder
					? "Has changes since the last save point"
					: "Changed since the last save point"
			}
		/>
	);
}

export const useChanged = () => useContext(ChangedPaths);
