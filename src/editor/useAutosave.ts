import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { linksIn } from "../core/links/links";
import { headerIcon } from "../core/notes/icon";
import { headerProps } from "../core/notes/properties";
import { previewOf, searchTextOf } from "../core/notes/scan";
import { tagsOf } from "../core/notes/tags";
import { searchFieldsOf } from "../core/search/fields";
import { getLogger } from "../debug/index";
import type { Host } from "../host/host";
import {
	type Autosave,
	type AutosaveOptions,
	type AutosaveState,
	createAutosave,
	type SaveResult,
} from "./autosave";
import type { OpenedNote } from "./note-io";
import { type Draft, saveDraft } from "./save-draft";

const SAVED: AutosaveState = { kind: "saved" };

export interface SavedInfo {
	/** The note's path before and after this save (they differ after a rename). */
	oldPath: string;
	path: string;
	created?: boolean;
	title: string;
	preview: string;
	icon?: string;
	/** The body text (capped) and the `noteId`s linked, kept so search and "Linked from" stay current. */
	text?: string;
	headings?: string[];
	properties?: string[];
	updatedAt: number;
	links?: string[];
	titleChanged: boolean;
	/** The note's tags as saved. */
	tags: string[];
	notice?: string;
}

type Written = (note: OpenedNote, draft: Draft, info: SavedInfo) => void;
export interface DraftAutosaveOwner {
	write(
		host: Host,
		save: (host: Host, base: OpenedNote) => Promise<SaveResult>,
	): Promise<SaveResult>;
	autosave(
		create: (written: Written) => Autosave<Draft>,
	): Autosave<Draft> | null;
}

/**
 * Whether a completed save belongs to the note that is open right now. A save
 * flushed on cleanup while switching notes still updates the vault's note list,
 * but must not overwrite the new note's live path or notice.
 */
export function isSaveForOpenNote(
	info: Pick<SavedInfo, "oldPath">,
	livePath: string | null,
): boolean {
	return info.oldPath === livePath;
}

/**
 * Autosave for the open note. Edits are saved after a short pause, and also
 * when requested by the workspace (or by the window when used on its own).
 * `flush` saves right now and says whether everything is on disk.
 */
export function useAutosave(
	host: Host,
	opened: OpenedNote | null,
	onSaved?: (info: SavedInfo) => void,
	owner?: DraftAutosaveOwner | null,
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

	useLayoutEffect(() => {
		if (!opened?.editable) {
			current.current = null;
			currentFor.current = null;
			early.current = null;
			setState(SAVED);
			return;
		}
		let note: OpenedNote = opened;
		let written: Written = (_, _draft, info) => savedRef.current?.(info);
		function write(host: Host, base: OpenedNote) {
			return async (draft: Draft): Promise<SaveResult> => {
				const started = performance.now();
				const result = await saveDraft(host, base, draft);
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
				const oldPath = base.path;
				note = {
					...base,
					path: result.path,
					note: result.note,
					doc: draft.doc,
					baseText: result.text,
				};
				written(note, draft, {
					oldPath,
					path: result.path,
					...(base.baseText === null ? { created: true } : {}),
					title:
						typeof result.note.header.title === "string"
							? result.note.header.title
							: result.path,
					preview: previewOf(result.note.blocks),
					icon: headerIcon(result.note.header),
					text: searchTextOf(result.note.blocks),
					...searchFieldsOf(result.note),
					updatedAt: Date.now(),
					links: [
						...new Set(linksIn(result.note.blocks).map((link) => link.target)),
					],
					titleChanged: result.titleChanged,
					tags: tagsOf(headerProps(result.note.header)),
					...(result.notice ? { notice: result.notice } : {}),
				});
				return { ok: true };
			};
		}
		const options: AutosaveOptions<Draft> = {
			save: (draft) =>
				owner
					? owner.write(host, (host, base) => write(host, base)(draft))
					: write(host, note)(draft),
		};
		const auto = owner
			? owner.autosave((publish) => {
					written = publish;
					return createAutosave(options);
				})
			: createAutosave(options);
		if (!auto) return;
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
			if (owner) return;
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
	}, [host, opened, owner]);

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
		if (owner !== undefined) return;
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
	}, [flush, owner]);

	return { state, change, flush, retry, peek, discard, failureReason };
}
