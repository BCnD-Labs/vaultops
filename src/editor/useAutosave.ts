import { useCallback, useEffect, useRef, useState } from "react";
import { headerProps } from "../core/notes/properties";
import { previewOf } from "../core/notes/scan";
import { tagsOf } from "../core/notes/tags";
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
	preview: string;
	titleChanged: boolean;
	/** The note's tags as saved. */
	tags: string[];
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

	// The note on screen right now, and the note `current` was made for. They
	// differ between the render that shows a note and its effect below.
	const shown = useRef(opened);
	shown.current = opened;
	const currentFor = useRef<OpenedNote | null>(null);
	// An edit can arrive after a note is on screen but before the effect below
	// has made its autosave. Keep it here, with the note it belongs to, and hand
	// it to that note's autosave, so it is not lost or sent to another note.
	const early = useRef<{ note?: OpenedNote | null; draft: Draft } | null>(null);

	useEffect(() => {
		if (!opened?.editable) {
			current.current = null;
			currentFor.current = null;
			early.current = null;
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
				note = {
					...note,
					path: result.path,
					note: result.note,
					baseText: result.text,
				};
				savedRef.current?.({
					oldPath,
					path: result.path,
					title: draft.title,
					preview: previewOf(result.note.blocks),
					titleChanged: result.titleChanged,
					tags: tagsOf(headerProps(result.note.header)),
					...(result.notice ? { notice: result.notice } : {}),
				});
				return { ok: true };
			},
		});
		current.current = auto;
		currentFor.current = opened;
		if (
			early.current &&
			(early.current.note === undefined || early.current.note === opened)
		) {
			auto.change(early.current.draft);
			early.current = null;
		}
		setState(auto.getState());
		const unsubscribe = auto.subscribe(setState);
		return () => {
			unsubscribe();
			if (current.current === auto) {
				current.current = null;
				currentFor.current = null;
			}
			const pending = auto.peek();
			// In a batched `act()` scope, `rerender(next)` and `change(nextDraft)`
			// can run `change` before `next` renders; `shown.current` is `next` by
			// the time this cleanup runs. Hand such an edit to `next` instead of
			// writing it into the previous note.
			if (
				pending !== null &&
				shown.current &&
				shown.current !== opened &&
				pending.doc === shown.current.doc
			) {
				early.current = { note: shown.current, draft: pending };
				auto.dispose();
				return;
			}
			// Save anything still unsaved before stopping, so a switch never
			// discards an edit.
			void auto.flush().finally(() => auto.dispose());
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
	const peek = useCallback(
		() =>
			(currentFor.current === shown.current
				? current.current?.peek()
				: early.current?.draft) ?? null,
		[],
	);
	const discard = useCallback(() => {
		early.current = null;
		current.current?.discard();
	}, []);
	const failureReason = useCallback(() => {
		const state = current.current?.getState();
		return state?.kind === "failed" ? state.reason : null;
	}, []);
	const change = useCallback((draft: Draft, note?: OpenedNote | null) => {
		const target = note !== undefined ? note : shown.current;
		if (current.current && currentFor.current === target)
			current.current.change(draft);
		else early.current = { note, draft };
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

	return { state, change, flush, retry, peek, discard, failureReason };
}
