import { useCallback, useEffect, useRef, useState } from "react";
import { getLogger } from "../debug/index";
import type { Host } from "../host/host";
import { type Autosave, type AutosaveState, createAutosave } from "./autosave";
import type { OpenedNote } from "./note-io";
import { type Draft, saveDraft } from "./save-draft";

const SAVED: AutosaveState = { kind: "saved" };

export interface SavedInfo {
	/** The note's path before and after this save (they differ after a rename). */
	oldPath: string;
	path: string;
	title: string;
	titleChanged: boolean;
	notice?: string;
}

/**
 * Autosave for the open note. Edits are saved after a short pause, and also
 * when the window loses focus or is hidden. `flush` saves right now and says
 * whether everything is on disk. A new autosave starts for each `opened` value.
 */
export function useAutosave(
	host: Host,
	opened: OpenedNote | null,
	onSaved?: (info: SavedInfo) => void,
) {
	const [state, setState] = useState<AutosaveState>(SAVED);
	const current = useRef<Autosave<Draft> | null>(null);
	const savedRef = useRef(onSaved);
	savedRef.current = onSaved;

	useEffect(() => {
		if (!opened?.editable) {
			current.current = null;
			setState(SAVED);
			return;
		}
		let note: OpenedNote = opened;
		const auto = createAutosave<Draft>({
			save: async (draft) => {
				const started = performance.now();
				const result = await saveDraft(host, note, draft);
				const logger = getLogger();
				const ms = Math.round(performance.now() - started);
				if (!result.ok) {
					const conflict = "conflict" in result && result.conflict === true;
					logger.count(conflict ? "save-conflicts" : "save-failures");
					logger.log({
						kind: "save",
						name: conflict ? "conflict" : "failed",
						ms,
						ok: false,
						detail: { reason: result.message },
					});
					return result;
				}
				logger.count("saves");
				logger.log({
					kind: "save",
					name: "written",
					ms,
					ok: true,
					detail: { renamed: result.titleChanged },
				});
				// Build the next save on what was just written, at its new path.
				const oldPath = note.path;
				note = { ...note, path: result.path, note: result.note };
				savedRef.current?.({
					oldPath,
					path: result.path,
					title: draft.title,
					titleChanged: result.titleChanged,
					...(result.notice ? { notice: result.notice } : {}),
				});
				return { ok: true };
			},
		});
		current.current = auto;
		setState(auto.getState());
		const unsubscribe = auto.subscribe(setState);
		return () => {
			unsubscribe();
			auto.dispose();
			if (current.current === auto) current.current = null;
		};
	}, [host, opened]);

	const flush = useCallback(
		() => current.current?.flush() ?? Promise.resolve(true),
		[],
	);
	const retry = useCallback(
		() => current.current?.retry() ?? Promise.resolve(true),
		[],
	);
	const change = useCallback((draft: Draft) => {
		current.current?.change(draft);
	}, []);

	useEffect(() => {
		const onHidden = () => void flush();
		const onVisibility = () => {
			if (document.visibilityState === "hidden") onHidden();
		};
		window.addEventListener("blur", onHidden);
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			window.removeEventListener("blur", onHidden);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [flush]);

	return { state, change, flush, retry };
}
