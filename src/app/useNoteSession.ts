import type { JSONContent } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { headerCover } from "../core/notes/cover";
import { type HighlightItem, highlightsOf } from "../core/notes/highlights";
import { headerIcon } from "../core/notes/icon";
import { type OutlineItem, outlineOf } from "../core/notes/outline";
import {
	headerProps,
	type Props as NoteProps,
	withProps,
} from "../core/notes/properties";
import { type TextStats, textStats } from "../core/notes/text-stats";
import type { ResourceType } from "../core/resources/resources";
import { applyType, typeIdOf, withType } from "../core/types/apply";
import { getLogger } from "../debug/index";
import {
	lockedForReadOnlyVault,
	type OpenedNote,
	openNote,
} from "../editor/note-io";
import type { Draft } from "../editor/save-draft";
import {
	isSaveForOpenNote,
	type SavedInfo,
	useAutosave,
} from "../editor/useAutosave";
import type { Host } from "../host/host";
import type { LiveDocuments } from "./live-documents";

type Binding = ReturnType<LiveDocuments["subscribe"]>;

// How long writing must pause before the status bar recounts.
const STATS_DELAY_MS = 300;
export const UNSAVED_NOTE_MESSAGE =
	"This note is not saved yet. Retry saving before leaving it.";

export interface NoteSessionOptions {
	/** The host saves go through (the vault host, which refuses writes when read-only). */
	host: Host;
	/** False when the vault is read-only: the note is shown locked. */
	writable: boolean;
	documents: () => LiveDocuments | null;
	/** Called when this note's session could not settle. */
	onUnsaved: (message: string) => void;
}

/**
 * Everything about one live note: the note itself, its title, properties and
 * document, the counts the status bar shows, and controls for its autosave.
 */
export function useNoteSession({
	host,
	writable,
	documents,
	onUnsaved,
}: NoteSessionOptions) {
	const [openedNote, setOpened] = useState<OpenedNote | null>(null);
	const [editorRevision, setEditorRevision] = useState(0);
	const [livePath, setLivePath] = useState<string | null>(null);
	const [iconEdit, setIconEdit] = useState<string | null>();
	const [coverEdit, setCoverEdit] = useState<string | null>();
	const coverRef = useRef<string | null>(undefined);
	const iconRef = useRef<string | null>(undefined);
	const [typeEdit, setTypeEdit] = useState<string | null>();
	const typeRef = useRef<string | null>(undefined);
	const [title, setTitle] = useState("");
	const [notice, setNotice] = useState<string | null>(null);
	const [props, setProps] = useState<NoteProps | null>({});
	const [stats, setStats] = useState<TextStats | null>(null);
	const [highlights, setHighlights] = useState<HighlightItem[]>([]);
	const [outline, setOutline] = useState<OutlineItem[]>([]);
	const docRef = useRef<JSONContent | null>(null);
	const titleRef = useRef("");
	const propsRef = useRef<NoteProps | null>({});
	const livePathRef = useRef<string | null>(null);
	const statsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [binding, setBinding] = useState<Binding | null>(null);
	const [editorOwner, setEditorOwner] = useState<symbol | null>(null);
	const [, showSharedDoc] = useState<JSONContent>();
	const attached = useRef<Binding | null>(null);
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
			setHighlights(highlightsOf(docRef.current?.content));
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
	}, []);
	const autosave = useAutosave(host, opened, undefined, binding);
	const { flush } = autosave;

	/** Save just this note before changing tabs. */
	const settle = useCallback(async () => {
		if (await flush()) return true;
		unsavedCallback.current(UNSAVED_NOTE_MESSAGE);
		return false;
	}, [flush]);

	/** Put a note that was just read from disk on screen. */
	const show = useCallback((next: OpenedNote, path: string, draft?: Draft) => {
		docRef.current = draft?.doc ?? next.doc;
		iconRef.current = draft?.icon;
		setIconEdit(draft?.icon);
		coverRef.current = draft?.cover;
		setCoverEdit(draft?.cover);
		typeRef.current = draft?.type;
		setTypeEdit(draft?.type);
		setStats(textStats(docRef.current));
		setHighlights(highlightsOf(docRef.current?.content));
		setOutline(outlineOf(docRef.current));
		const title = draft?.title ?? next.note?.header.title;
		const text = typeof title === "string" ? title : path;
		titleRef.current = text;
		setTitle(text);
		setNotice(next.notice ?? null);
		livePathRef.current = path;
		setLivePath(path);
		const loaded = draft?.props ?? headerProps(next.note?.header);
		propsRef.current = loaded;
		setProps(loaded);
		setOpened(next);
		setEditorRevision((revision) => revision + 1);
	}, []);

	const subscribe = (path: string, seed?: OpenedNote) => {
		const next = documents()?.subscribe(
			{ path },
			({ lastSave, opened, path, editorOwner, editorDraft }, reloaded) => {
				if (attached.current !== next) return;
				setEditorOwner(editorOwner);
				if (!reloaded && editorDraft && docRef.current !== editorDraft.doc) {
					docRef.current = editorDraft.doc;
					showSharedDoc(editorDraft.doc);
					refreshStats();
				}
				if (reloaded && opened) show(opened, path);
				else if (lastSave) handleSaved(lastSave);
				else if (path !== livePathRef.current) {
					livePathRef.current = path;
					setLivePath(path);
				}
			},
			seed,
		);
		return next;
	};

	const load = (
		note: OpenedNote,
		path: string,
		next = subscribe(path, note),
	) => {
		const snapshot = next?.current();
		if (!next || !snapshot?.opened) return;
		void flush();
		attached.current?.unsubscribe();
		attached.current = next;
		setBinding(next);
		setEditorOwner(next.current()?.editorOwner ?? null);
		show(snapshot.opened, snapshot.path, snapshot.editorDraft);
		if (snapshot.lastSave) setNotice(snapshot.lastSave.notice ?? null);
	};

	const reload = async (host: Host, path: string) => {
		const entry = attached.current;
		const snapshot = entry?.current();
		if (!entry || snapshot?.path !== path) return;
		const stillCurrent = () =>
			attached.current === entry && entry.current() === snapshot;
		try {
			const note = await openNote(host, path);
			if (stillCurrent()) entry.reload(note);
		} catch (error) {
			if (stillCurrent()) throw error;
		}
	};
	useEffect(() => () => attached.current?.unsubscribe(), []);

	/** Put the note away (it was saved by the caller) and forget its path. */
	const clear = useCallback(() => {
		attached.current?.unsubscribe();
		attached.current = null;
		setBinding(null);
		setOpened(null);
		livePathRef.current = null;
		setLivePath(null);
	}, []);

	/** Hide the note without forgetting its path (the screen changes around it). */
	const hide = useCallback(() => setOpened(null), []);

	/** Let the person edit a note that was opened locked. */
	const unlock = useCallback(() => {
		const unlocked = attached.current?.unlock();
		if (unlocked) {
			setOpened(unlocked);
			setNotice(null);
		}
	}, []);

	// What gets saved: the body, the title and, unless the file keeps its props
	// in a form we can't edit, the properties.
	const draftOf = (doc: JSONContent, nextTitle: string): Draft => ({
		...binding?.current()?.editorDraft,
		...autosave.peek(),
		doc,
		title: nextTitle,
		icon: iconRef.current,
		cover: coverRef.current,
		...(typeRef.current !== undefined ? { type: typeRef.current } : {}),
		...(propsRef.current ? { props: propsRef.current } : {}),
	});

	const editIcon = (next: string | null) => {
		if (!opened?.editable || !docRef.current) return;
		iconRef.current = next;
		setIconEdit(next);
		autosave.change(draftOf(docRef.current, titleRef.current), opened);
	};

	const editCover = (next: string | null) => {
		if (!opened?.editable || !docRef.current) return;
		coverRef.current = next;
		setCoverEdit(next);
		autosave.change(draftOf(docRef.current, titleRef.current), opened);
	};

	const editProps = (next: NoteProps) => {
		if (!opened?.editable) return;
		propsRef.current = next;
		setProps(next);
		if (docRef.current)
			autosave.change(draftOf(docRef.current, titleRef.current), opened);
	};

	/**
	 * Give the open note a type, or take it off (null). Adding fields and setting
	 * the type are one edit in this note's own draft, so nothing on disk is
	 * written around the editor. Returns why it was refused, or null.
	 */
	const editType = (type: ResourceType | null): string | null => {
		const header = opened?.note?.header;
		if (!opened?.editable || !header) return "This note can't be edited.";
		if (type === null) {
			typeRef.current = null;
			setTypeEdit(null);
		} else {
			if (propsRef.current === null)
				return "This note's properties can't be edited here, so its type was not set.";
			const current = withType(
				withProps(header, propsRef.current),
				typeRef.current === undefined ? typeIdOf(header) : typeRef.current,
			);
			const applied = applyType(current, type);
			if (!applied.ok) return applied.message;
			const next = headerProps(applied.header);
			if (next) {
				propsRef.current = next;
				setProps(next);
			}
			typeRef.current = type.id;
			setTypeEdit(type.id);
		}
		if (docRef.current)
			autosave.change(draftOf(docRef.current, titleRef.current), opened);
		return null;
	};

	const editTitle = (next: string) => {
		if (!opened?.editable) return;
		titleRef.current = next;
		setTitle(next);
		if (docRef.current) autosave.change(draftOf(docRef.current, next), opened);
	};

	const editDoc = (doc: JSONContent) => {
		if (!opened?.editable) return;
		docRef.current = doc;
		refreshStats();
		getLogger().count("edits");
		autosave.change(draftOf(doc, titleRef.current), opened);
	};

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
		binding,
		editorElsewhere: editorOwner !== null && !binding?.ownsEditor(),
		stats,
		highlights,
		outline,
		docRef,
		saveState: autosave.state,
		load,
		subscribe,
		reload,
		clear,
		hide,
		unlock,
		settle,
		flush: autosave.flush,
		retry: autosave.retry,
		peek: autosave.peek,
		discard: autosave.discard,
		failureReason: autosave.failureReason,
		icon:
			iconEdit === undefined
				? headerIcon(opened?.note?.header)
				: (iconEdit ?? undefined),
		editIcon,
		cover:
			coverEdit === undefined
				? headerCover(opened?.note?.header)
				: (coverEdit ?? undefined),
		host,
		editCover,
		editProps,
		/** The note's type id, or null. */
		typeId:
			typeEdit === undefined
				? opened?.note
					? typeIdOf(opened.note.header)
					: null
				: typeEdit,
		editType,
		editTitle,
		editDoc,
	};
}

/** What `useNoteSession` returns: one live note and everything about it. */
export type NoteSession = ReturnType<typeof useNoteSession>;
