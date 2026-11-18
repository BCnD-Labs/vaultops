import type { JSONContent } from "@tiptap/core";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useInViewport } from "@/components/ui/use-in-viewport";
import type { Block } from "../core/note-format";
import type { EmbedTarget } from "../core/notes/canvas-embed";
import { docToBlocks } from "../editor/doc-blocks";
import { NoteEditor } from "../editor/NoteEditor";
import type { OpenedNote } from "../editor/note-io";
import type { LinkSource } from "../editor/note-link";
import { useAutosave } from "../editor/useAutosave";
import type { Host } from "../host/host";
import { NoteBlocks } from "./CanvasCard";
import type { LiveDocument, LiveDocuments } from "./live-documents";
import type { NoteRow } from "./session";
import { featureEnabled } from "./useFeature";

const updates = new Set<() => void>();
let scheduled = false;
const projected = new WeakMap<JSONContent, Block[]>();
type Binding = ReturnType<LiveDocuments["subscribe"]>;

export function liveNoteSnapshot(document: LiveDocument | null) {
	if (!document?.draft || document.kind !== "note") return null;
	const edit = document.editorDraft;
	if (!edit) return { blocks: document.draft.blocks };
	if (document.saveStatus.kind === "saved")
		return { blocks: (document.base ?? document.draft).blocks };
	let blocks = projected.get(edit.doc);
	if (!blocks) {
		blocks = docToBlocks(edit.doc);
		projected.set(edit.doc, blocks);
	}
	return {
		blocks,
		title:
			edit.title === undefined ? undefined : edit.title.trim() || "Untitled",
	};
}

const WHY: { [status: string]: string } = {
	missing:
		"This note is not in the vault. The embed keeps its link, so it shows again if the note comes back.",
	ambiguous:
		"More than one file has this note's id, so none is shown. Vault health lists them.",
	canvas: "A canvas cannot be shown inside a canvas.",
	unlinked: "This embed does not point at a note.",
};

/**
 * A note on a canvas, found by its id so a rename does not
 * break it. Only visible embeds listen to the workspace's shared note entry.
 */
export function CanvasEmbed({
	documents,
	target,
	host,
	links,
	locked = false,
	onOpen,
}: {
	documents: LiveDocuments | null;
	target: EmbedTarget<NoteRow>;
	host?: Host;
	links?: LinkSource;
	locked?: boolean;
	onOpen?: (path: string) => void;
}) {
	const row = target.status === "found" ? target.row : null;
	const { ref, visible } = useInViewport();
	const noteId = row?.id;
	const path = row?.path;
	const readOnly = row?.readOnly;
	const canEdit = Boolean(host && documents && noteId && !readOnly && !locked);
	const [requested, setRequested] = useState(false);
	const [editing, setEditing] = useState<{
		binding: Binding;
		opened: OpenedNote;
		readOnly: boolean;
	} | null>(null);
	useEffect(() => {
		const node = ref.current?.closest<HTMLElement>(".react-flow__node");
		if (!node || !canEdit) return;
		const enter = ({ key, isComposing, target }: KeyboardEvent) => {
			if (
				key === "Enter" &&
				!isComposing &&
				target === node &&
				node.matches(".selected")
			)
				setRequested(true);
		};
		node.addEventListener("keydown", enter);
		return () => node.removeEventListener("keydown", enter);
	}, [ref, canEdit]);
	useEffect(() => {
		if (!canEdit) setRequested(false);
		if (!requested || !documents || !noteId || !canEdit) return;
		let active = true;
		let readOnly: boolean | undefined;
		const binding = documents.subscribe({ noteId }, (document) => {
			if (binding.ownsEditor() && document.opened?.editable) {
				if (readOnly !== document.readOnly)
					setEditing({
						binding,
						opened: document.opened,
						readOnly: document.readOnly,
					});
				readOnly = document.readOnly;
			} else if (readOnly !== undefined) setRequested(false);
		});
		void binding.ready.then(
			(document) => {
				if (
					active &&
					(!document?.opened?.editable || !binding.setEditorOwner(true, true))
				)
					setRequested(false);
			},
			() => {
				if (active) setRequested(false);
			},
		);
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && ref.current?.contains(event.target))
				return;
			if (
				event.target instanceof Element &&
				event.target.closest(
					'.slash-menu, .db-peek-layer, .floating-editor, [data-slot="context-menu-content"][aria-label="Table"]',
				)
			)
				return;
			if (binding.ownsEditor()) binding.setEditorOwner(false);
			else setRequested(false);
		};
		window.document.addEventListener("pointerdown", outside, true);
		return () => {
			active = false;
			binding.unsubscribe();
			window.document.removeEventListener("pointerdown", outside, true);
			setEditing(null);
		};
	}, [ref, requested, documents, noteId, canEdit]);
	const activeEditor =
		canEdit && editing?.binding.ownsEditor() ? editing : null;
	const [shown, setShown] = useState<ReturnType<typeof liveNoteSnapshot>>();
	useEffect(() => {
		setShown(readOnly ? null : undefined);
		if (!visible || !noteId || !path || !documents || readOnly) return;
		let active = true;
		const show = () => {
			const next = liveNoteSnapshot(subscription.current());
			setShown((previous) =>
				previous &&
				next &&
				previous.blocks === next.blocks &&
				previous.title === next.title
					? previous
					: next,
			);
		};
		const queue = () => {
			if (!active) return;
			updates.add(show);
			if (scheduled) return;
			scheduled = true;
			requestAnimationFrame(() => {
				scheduled = false;
				const batch = [...updates];
				updates.clear();
				for (const update of batch) update();
			});
		};
		const subscription = documents.subscribePassive(noteId, queue);
		void subscription.ready.then(queue, queue);
		return () => {
			active = false;
			updates.delete(show);
			subscription.unsubscribe();
		};
	}, [documents, noteId, path, readOnly, visible]);
	const current = visible ? shown : undefined;
	const title = current?.title ?? row?.title ?? "Embedded note";
	const state = current ? "ready" : current === null ? "unreadable" : "loading";
	return (
		<article
			ref={ref}
			aria-label="Embedded note"
			className={`canvas-item canvas-embed${locked ? " canvas-item-pinned" : ""}${canEdit ? " nopan" : ""}${activeEditor ? " nodrag" : ""}`}
			data-state={row ? state : target.status}
			data-editing={!!activeEditor || undefined}
			tabIndex={canEdit ? -1 : undefined}
			onDoubleClick={canEdit ? () => setRequested(true) : undefined}
			onKeyDown={(event) => {
				if (event.nativeEvent.isComposing) return;
				if (
					canEdit &&
					event.key === "Enter" &&
					event.target === event.currentTarget
				)
					setRequested(true);
				if (event.key !== "Escape" || !activeEditor) return;
				event.preventDefault();
				event.stopPropagation();
				activeEditor.binding.setEditorOwner(false);
				event.currentTarget.focus();
			}}
			title={
				locked
					? "Shapes, sticky notes, labels, groups, embedded notes and connectors stay on the canvas."
					: undefined
			}
		>
			<header className="canvas-embed-bar">
				<span className="canvas-embed-title">{title}</span>
				{row && onOpen && (
					<Button
						size="icon"
						variant="ghost"
						className="nodrag"
						aria-label={`Open ${title}`}
						title="Open the note"
						onClick={() => onOpen(row.path)}
						onDoubleClick={(event) => event.stopPropagation()}
					>
						<ExternalLink size={14} aria-hidden="true" />
					</Button>
				)}
			</header>
			<div className="canvas-embed-body nowheel">
				{activeEditor && host ? (
					<SharedNoteEditor host={host} links={links} {...activeEditor} />
				) : !row ? (
					<p className="canvas-embed-note">{WHY[target.status]}</p>
				) : current ? (
					<NoteBlocks blocks={current.blocks} />
				) : current === null ? (
					<p className="canvas-embed-note">This note could not be read.</p>
				) : null}
			</div>
		</article>
	);
}

export function SharedNoteEditor({
	host,
	links,
	binding,
	opened,
	readOnly,
	focusOnAttach = true,
}: {
	host: Host;
	links?: LinkSource;
	binding: Binding;
	opened: OpenedNote;
	readOnly: boolean;
	focusOnAttach?: boolean;
}) {
	const { change } = useAutosave(host, opened, undefined, binding);
	const draft = binding.current()?.editorDraft;
	return (
		<NoteEditor
			doc={draft?.doc ?? opened.doc}
			noteId={opened.note?.header.noteId}
			slot={binding.editorSlot}
			editable={!readOnly}
			links={links}
			featureOn={featureEnabled}
			focusOnAttach={focusOnAttach}
			onChange={(doc) => {
				const latest = binding.current();
				if (readOnly || !latest || latest.readOnly || !binding.ownsEditor())
					return;
				change({ ...latest.editorDraft, doc });
			}}
		/>
	);
}
