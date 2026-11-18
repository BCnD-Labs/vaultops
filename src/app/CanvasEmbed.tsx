import type { JSONContent } from "@tiptap/core";
import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useInViewport } from "@/components/ui/use-in-viewport";
import type { Block } from "../core/note-format";
import type { EmbedTarget } from "../core/notes/canvas-embed";
import { docToBlocks } from "../editor/doc-blocks";
import { NoteBlocks } from "./CanvasCard";
import type { LiveDocument, LiveDocuments } from "./live-documents";
import type { NoteRow } from "./session";

const updates = new Set<() => void>();
let scheduled = false;
const projected = new WeakMap<JSONContent, Block[]>();

function snapshot(document: LiveDocument | null) {
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
	return { blocks, title: edit.title.trim() || "Untitled" };
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
 * A note shown read-only on a canvas, found by its id so a rename does not
 * break it. Only visible embeds listen to the workspace's shared note entry.
 */
export function CanvasEmbed({
	documents,
	target,
	locked = false,
	onOpen,
}: {
	documents: LiveDocuments | null;
	target: EmbedTarget<NoteRow>;
	locked?: boolean;
	onOpen?: (path: string) => void;
}) {
	const row = target.status === "found" ? target.row : null;
	const { ref, visible } = useInViewport();
	const noteId = row?.id;
	const path = row?.path;
	const readOnly = row?.readOnly;
	const [shown, setShown] = useState<ReturnType<typeof snapshot>>();
	useEffect(() => {
		setShown(readOnly ? null : undefined);
		if (!visible || !noteId || !path || !documents || readOnly) return;
		let active = true;
		const show = () => {
			const next = snapshot(subscription.current());
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
			className={`canvas-item canvas-embed${locked ? " canvas-item-pinned" : ""}`}
			data-state={row ? state : target.status}
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
					>
						<ExternalLink size={14} aria-hidden="true" />
					</Button>
				)}
			</header>
			<div className="canvas-embed-body nowheel">
				{!row ? (
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
