import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type OutlineItem, outlineOf } from "../core/notes/outline";
import { headerProps, type Props as NoteProps } from "../core/notes/properties";
import { type TextStats, textStats } from "../core/notes/text-stats";
import { buildRecoveryText } from "../core/session/recovery";
import { getLogger } from "../debug/index";
import {
	allowEditing,
	lockedForReadOnlyVault,
	type OpenedNote,
} from "../editor/note-io";
import type { Draft } from "../editor/save-draft";
import {
	isSaveForOpenNote,
	type SavedInfo,
	useAutosave,
} from "../editor/useAutosave";
import type { Host } from "../host/host";

// How long writing must pause before the status bar recounts.
const STATS_DELAY_MS = 300;

export interface NoteSessionOptions {
	/** The host saves go through (the vault host, which refuses writes when read-only). */
	host: Host;
	/** False when the vault is read-only: the note is shown locked. */
	writable: boolean;
	/**
	 * Called after every save, for what lives outside the session (tabs, history,
	 * the note list). The session has already updated its own path and notice.
	 */
	onSaved: (info: SavedInfo) => void;
	/** Called with a message when leaving the note was refused because it is unsaved. */
	onUnsaved: (message: string) => void;
}

/**
 * Everything about one live note: the note itself, its title, properties and
 * document, the counts the status bar shows, autosave, and what the quit guard
 * needs to keep unsaved text. The window owns one today; the workspace will own
 * one per note that is shown, so nothing here may reach for window state.
 */
export function useNoteSession({
	host,
	writable,
	onSaved,
	onUnsaved,
}: NoteSessionOptions) {
	const [openedNote, setOpened] = useState<OpenedNote | null>(null);
	const [editorRevision, setEditorRevision] = useState(0);
	const [livePath, setLivePath] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [props, setProps] = useState<NoteProps | null>({});
	const [stats, setStats] = useState<TextStats | null>(null);
	const [outline, setOutline] = useState<OutlineItem[]>([]);
	const docRef = useRef<JSONContent | null>(null);
	const titleRef = useRef("");
	const propsRef = useRef<NoteProps | null>({});
	const livePathRef = useRef<string | null>(null);
	const statsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const savedCallback = useRef(onSaved);
	savedCallback.current = onSaved;
	const unsavedCallback = useRef(onUnsaved);
	unsavedCallback.current = onUnsaved;

	const opened = useMemo(
		() =>
			openedNote && !writable ? lockedForReadOnlyVault(openedNote) : openedNote,
		[openedNote, writable],
	);

	// Typing only schedules a recount, so a long note is counted once the
	// writing pauses, never on every key.
	const refreshStats = useCallback(() => {
		clearTimeout(statsTimer.current);
		statsTimer.current = setTimeout(() => {
			setStats(textStats(docRef.current));
			setOutline(outlineOf(docRef.current));
		}, STATS_DELAY_MS);
	}, []);
	useEffect(() => () => clearTimeout(statsTimer.current), []);

	const handleSaved = useCallback((info: SavedInfo) => {
		if (isSaveForOpenNote(info, livePathRef.current)) {
			setNotice(info.notice ?? null);
			livePathRef.current = info.path;
			setLivePath(info.path);
		}
		savedCallback.current(info);
	}, []);
	const autosave = useAutosave(host, opened, handleSaved);
	const { flush } = autosave;

	// Leaving a note (open another, change vault) first saves it; if that
	// fails the note stays open so nothing typed is lost.
	const settle = useCallback(async () => {
		if (await flush()) return true;
		unsavedCallback.current(
			"This note is not saved yet. Retry saving before leaving it.",
		);
		return false;
	}, [flush]);

	/** Put a note that was just read from disk on screen. */
	const load = useCallback((next: OpenedNote, path: string) => {
		docRef.current = next.doc;
		setStats(textStats(next.doc));
		setOutline(outlineOf(next.doc));
		const text =
			typeof next.note?.header.title === "string"
				? next.note.header.title
				: path;
		titleRef.current = text;
		setTitle(text);
		setNotice(next.notice ?? null);
		livePathRef.current = path;
		setLivePath(path);
		const loaded = headerProps(next.note?.header);
		propsRef.current = loaded;
		setProps(loaded);
		setOpened(next);
		setEditorRevision((revision) => revision + 1);
	}, []);

	/** Put the note away (it was saved by the caller) and forget its path. */
	const clear = useCallback(() => {
		setOpened(null);
		livePathRef.current = null;
		setLivePath(null);
	}, []);

	/** Hide the note without forgetting its path (the screen changes around it). */
	const hide = useCallback(() => setOpened(null), []);

	/** Let the person edit a note that was opened locked. */
	const unlock = useCallback(() => {
		if (!opened) return;
		setOpened(allowEditing(opened));
		setNotice(null);
	}, [opened]);

	// What gets saved: the body, the title and, unless the file keeps its props
	// in a form we can't edit, the properties.
	const draftOf = (doc: JSONContent, nextTitle: string): Draft => ({
		doc,
		title: nextTitle,
		...(propsRef.current ? { props: propsRef.current } : {}),
	});

	const editProps = (next: NoteProps) => {
		propsRef.current = next;
		setProps(next);
		if (docRef.current)
			autosave.change(draftOf(docRef.current, titleRef.current), opened);
	};

	const editTitle = (next: string) => {
		titleRef.current = next;
		setTitle(next);
		if (docRef.current) autosave.change(draftOf(docRef.current, next), opened);
	};

	const editDoc = (doc: JSONContent) => {
		docRef.current = doc;
		refreshStats();
		getLogger().count("edits");
		autosave.change(draftOf(doc, titleRef.current), opened);
	};

	/** The unsaved text as recovery-file text, or null when no note is open. */
	const recoveryText = useCallback((now: Date) => {
		const doc = docRef.current;
		if (!doc) return null;
		return buildRecoveryText({
			path: livePathRef.current,
			title: titleRef.current,
			doc,
			now,
		});
	}, []);

	return {
		/** The note on screen, locked when the vault is read-only. */
		opened,
		/** The path the note is saved at right now (it changes when a rename lands). */
		livePath,
		livePathRef,
		title,
		props,
		notice,
		setNotice,
		editorRevision,
		stats,
		outline,
		docRef,
		saveState: autosave.state,
		load,
		clear,
		hide,
		unlock,
		settle,
		flush: autosave.flush,
		retry: autosave.retry,
		peek: autosave.peek,
		discard: autosave.discard,
		failureReason: autosave.failureReason,
		editProps,
		editTitle,
		editDoc,
		recoveryText,
	};
}
