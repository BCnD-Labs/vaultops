import type { JSONContent } from "@tiptap/core";
import DragHandle from "@tiptap/extension-drag-handle-react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorContent, useEditor } from "@tiptap/react";
import { GripVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	BLOCK_DRAG_TYPE,
	blockDragData,
	findBlockDropTarget,
	setBlockDragData,
	setBlockDragImage,
	setDragEffect,
} from "./block-drag";
import { createExtensions } from "./extensions";
import { ensureUniqueIds } from "./ids";
import "./editor.css";

export interface NoteEditorProps {
	/** The note's document. Read once when the editor mounts: give the component a new `key` to show another note. */
	doc: JSONContent;
	/** Called with the whole document after every edit. */
	onChange: (doc: JSONContent) => void;
	noteId?: string;
	editable?: boolean;
	onDropBlock?: (
		blockId: string,
		canvasId: string,
		after: string | null,
	) => Promise<void>;
}

/** The Tiptap editor for one note. It does no file access. */
export function NoteEditor({
	doc,
	onChange,
	noteId,
	editable = true,
	onDropBlock,
}: NoteEditorProps) {
	const latest = useRef(onChange);
	latest.current = onChange;
	const draggedBlock = useRef<ProseMirrorNode | null>(null);
	const dragStartEvent = useRef<DragEvent | null>(null);
	const preview = useRef<HTMLElement | null>(null);
	const [dropIndicator, setDropIndicator] = useState<{
		index: number;
		top: number;
	} | null>(null);

	useEffect(() => {
		const clearPreview = () => {
			preview.current?.remove();
			preview.current = null;
			setDropIndicator(null);
		};
		// The extension clears DataTransfer in its dragstart listener. The document
		// listener runs after it, while the browser still permits setting drag data.
		const addDragData = (event: DragEvent) => {
			if (event !== dragStartEvent.current) return;
			dragStartEvent.current = null;
			if (!noteId || !draggedBlock.current || !event.dataTransfer) return;
			const firstLine = setBlockDragData(
				event.dataTransfer,
				noteId,
				draggedBlock.current,
			);
			if (!firstLine) return;
			clearPreview();
			const element = document.createElement("div");
			element.className = "block-drag-preview";
			element.textContent = firstLine;
			document.body.append(element);
			setBlockDragImage(event.dataTransfer, element);
			preview.current = element;
		};
		document.addEventListener("dragstart", addDragData);
		document.addEventListener("dragend", clearPreview);
		document.addEventListener("drop", clearPreview);
		return () => {
			document.removeEventListener("dragstart", addDragData);
			document.removeEventListener("dragend", clearPreview);
			document.removeEventListener("drop", clearPreview);
			clearPreview();
			dragStartEvent.current = null;
		};
	}, [noteId]);

	const editor = useEditor({
		extensions: createExtensions(),
		content: ensureUniqueIds(doc),
		editable,
		onUpdate: ({ editor }) => {
			latest.current(editor.getJSON());
			// Hide on every edit; the extension shows it again on the next hover.
			editor.view.dispatch(editor.state.tr.setMeta("hideDragHandle", true));
		},
	});

	useEffect(() => {
		// Unlocking is not a content edit and must not start autosave.
		editor?.setEditable(editable, false);
	}, [editor, editable]);

	const updateDropIndicator = (event: React.DragEvent<HTMLElement>) => {
		if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return;
		event.preventDefault();
		setDragEffect(event.dataTransfer, "dropEffect", "move");
		if (!editor) return;
		const slot = findBlockDropTarget(
			editor.view.dom,
			editor.state.doc,
			event.clientY,
			event.currentTarget,
		);
		setDropIndicator((current) =>
			current?.index === slot.index && current.top === slot.top
				? current
				: { index: slot.index, top: slot.top },
		);
	};

	return (
		<section
			className="note-editor"
			aria-label="Note editor drop area"
			onDragEnter={updateDropIndicator}
			onDragOver={updateDropIndicator}
			onDragLeave={(event) => {
				const next = event.relatedTarget;
				if (next instanceof Node && event.currentTarget.contains(next)) return;
				setDropIndicator(null);
			}}
			onDragEnd={() => setDropIndicator(null)}
			onDropCapture={(event) => {
				setDropIndicator(null);
				if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return;
				const data = blockDragData(event.dataTransfer);
				if (data?.noteId === noteId) return;
				event.preventDefault();
				event.stopPropagation();
				if (!editor || !onDropBlock || !data) return;
				const { after } = findBlockDropTarget(
					editor.view.dom,
					editor.state.doc,
					event.clientY,
					event.currentTarget,
				);
				void onDropBlock(data.blockId, data.noteId, after);
			}}
		>
			<EditorContent editor={editor} />
			{dropIndicator !== null && (
				<div
					className="block-drop-indicator prosemirror-dropcursor-block"
					data-testid="block-drop-indicator"
					data-drop-index={dropIndicator.index}
					style={{ top: `${dropIndicator.top}px` }}
				/>
			)}
			{editor && editable && noteId && (
				<DragHandle
					editor={editor}
					className="block-drag-handle"
					onNodeChange={({ node }) => {
						draggedBlock.current = node;
					}}
					onElementDragStart={(event) => {
						dragStartEvent.current = event;
					}}
				>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label="Drag to move"
							>
								<GripVertical size={16} aria-hidden="true" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Drag to move</TooltipContent>
					</Tooltip>
				</DragHandle>
			)}
		</section>
	);
}
