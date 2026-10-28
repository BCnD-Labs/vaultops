import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Host } from "../host/host";
import { type Autosave, type AutosaveState, createAutosave } from "./autosave";
import { type OpenedNote, saveDoc } from "./note-io";

const SAVED: AutosaveState = { kind: "saved" };

/**
 * Autosave for the open note. Edits are saved after a short pause, and also
 * when the window loses focus or is hidden. `flush` saves right now and says
 * whether everything is on disk.
 */
export function useAutosave(host: Host, opened: OpenedNote | null) {
	const [state, setState] = useState<AutosaveState>(SAVED);
	const current = useRef<Autosave | null>(null);
	const openedRef = useRef(opened);
	openedRef.current = opened;
	const path = opened?.path ?? null;
	const editable = opened?.editable ?? false;

	// biome-ignore lint/correctness/useExhaustiveDependencies: a new autosave per note (path), not per object identity; the note itself is read through the ref.
	useEffect(() => {
		let note = openedRef.current;
		if (!note?.editable) {
			current.current = null;
			setState(SAVED);
			return;
		}
		const auto = createAutosave({
			save: async (doc) => {
				// Each successful save returns the note as written, so the next
				// save builds on it instead of on the version first opened.
				const result = await saveDoc(host, note as OpenedNote, doc);
				if (result.ok) note = { ...(note as OpenedNote), note: result.note };
				return result;
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
	}, [host, path, editable]);

	const flush = useCallback(
		() => current.current?.flush() ?? Promise.resolve(true),
		[],
	);
	const retry = useCallback(
		() => current.current?.retry() ?? Promise.resolve(true),
		[],
	);
	const change = useCallback((doc: JSONContent) => {
		current.current?.change(doc);
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
