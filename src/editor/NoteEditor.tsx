import type { Editor, JSONContent } from "@tiptap/core";
import DragHandle from "@tiptap/extension-drag-handle-react";
import { isHistoryTransaction, undoDepth } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { dropPoint } from "@tiptap/pm/transform";
import { EditorContent, Editor as TiptapEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { CornerLeftUp, GripVertical } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useFeature } from "../app/useFeature";
import {
	autoScrollOnDrag,
	BLOCK_DRAG_TYPE,
	blockDragData,
	blockDragNote,
	findBlockDropTarget,
	setBlockDragData,
	setDragEffect,
} from "./block-drag";
import { COLUMN_DRAG_RULES } from "./columns";
import { type DropSlotState, setDropSlot } from "./drop-slot";
import { createExtensions } from "./extensions";
import { FormatBar } from "./FormatBar";
import { ensureUniqueIds } from "./ids";
import { ImageBlock, type ImageSource } from "./image-block";
import { insertBlocksAtCaret, type TemplateCursor } from "./insert-blocks";
import { abandonLift, liftBlock } from "./lift";
import type { Anchor } from "./menu-placement";
import { findMovable, type Movable, moveOut, nestLabel } from "./move-out";
import { type LinkSource, setLinkSource } from "./note-link";
import { TEMPLATE_EVENT } from "./slash-items";
import { setSlashFeatureCheck } from "./slash-menu";
import { TableEdgeBars, TableMenuContent } from "./TableControls";
import { WordComplete } from "./word-complete";
import "./editor.css";

export interface NoteEditorSlot {
	editor?: Editor;
	nextEdit?: () => number;
	undoSequence?: number;
	emptyNote?: ProseMirrorNode;
	completion?: { completeOn: boolean; links?: LinkSource; noteId?: string };
	/** Where the editor's image blocks read and store pictures (the surface that owns it). */
	images?: ImageSource;
}

export interface NoteEditorProps {
	/** The note's document. Read once when the editor mounts: give the component a new `key` to show another note. */
	doc: JSONContent;
	/** Called with the whole document after every edit. */
	onChange: (doc: JSONContent) => void;
	noteId?: string;
	editable?: boolean;
	slot?: NoteEditorSlot;
	focusOnAttach?: boolean;
	onDropBlock?: (
		blockId: string,
		canvasId: string,
		slot: DropSlot,
		copy?: boolean,
	) => Promise<void>;
	/** Offers "Template" in the slash menu; called with where to put it. */
	onChooseTemplate?: (request: TemplateRequest) => void;
	/** Turns on `[[` and `@` links; says what can be linked and how to open it. */
	links?: LinkSource;
	/** Whether a feature is on; the slash menu hides the items of a feature that is off. */
	featureOn?: (featureId: string) => boolean;
	/** Shows image blocks and stores picked, pasted and dropped images. */
	images?: ImageSource;
}

/** Asked for when someone picks "Template" from the slash menu. */
export interface TemplateRequest {
	/** Where the caret is, so the picker can open beside it. */
	anchor: Anchor;
	/** Put blocks into the note at the caret. */
	insert: (
		nodes: JSONContent[],
		cursor: TemplateCursor | null,
		replace: boolean,
	) => boolean;
	selection: string;
	/** Hand the caret back to the note, for when the picker closes without a choice. */
	focus: () => void;
}

/** Where in the note a dropped block should land. */
export type DropSlot = { after: string | null; near: string[]; start: boolean };

/** The Tiptap editor for one note. It does no file access. */
export function NoteEditor({
	doc,
	onChange,
	noteId,
	editable = true,
	slot: sharedSlot,
	focusOnAttach,
	onDropBlock,
	onChooseTemplate,
	links,
	featureOn,
	images,
}: NoteEditorProps) {
	const completeOn = useFeature("word-complete");
	const localSlot = useRef<NoteEditorSlot>({});
	const slot = sharedSlot ?? localSlot.current;
	const initial = useRef({ doc, editable });
	initial.current = { doc, editable };
	const initialImages = useRef(images);
	initialImages.current = images;
	const completion = useRef({ completeOn, links, noteId });
	completion.current = { completeOn, links, noteId };
	const latest = useRef(onChange);
	latest.current = onChange;
	const chooseTemplate = useRef(onChooseTemplate);
	chooseTemplate.current = onChooseTemplate;
	const draggedBlock = useRef<ProseMirrorNode | null>(null);
	const dragStartEvent = useRef<DragEvent | null>(null);
	const draggedPos = useRef<number | null>(null);
	const editorRef = useRef<Editor | null>(null);
	const [dropIndicator, setDropIndicator] = useState<DropSlotState | null>(
		null,
	);
	const sectionRef = useRef<HTMLElement | null>(null);
	// The block under the pointer that can be taken out of the block holding it.
	const [movable, setMovable] = useState<{
		pos: number;
		from: string;
		top: number;
		left: number;
	} | null>(null);

	useEffect(() => {
		const clearIndicator = () => setDropIndicator(null);
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
			// Lift the block itself; without its element the browser's own picture stays.
			const pos = draggedPos.current;
			const dom = pos === null ? null : editorRef.current?.view.nodeDOM(pos);
			liftBlock(event, dom instanceof HTMLElement ? dom : null, {
				kind: "note",
			});
		};
		document.addEventListener("dragstart", addDragData);
		document.addEventListener("dragend", clearIndicator);
		document.addEventListener("drop", clearIndicator);
		return () => {
			document.removeEventListener("dragstart", addDragData);
			document.removeEventListener("dragend", clearIndicator);
			document.removeEventListener("drop", clearIndicator);
			clearIndicator();
			abandonLift();
			dragStartEvent.current = null;
		};
	}, [noteId]);

	const [editor, setEditor] = useState<Editor | null>(null);
	useLayoutEffect(() => {
		// Acquire after the previous surface's EditorContent has unmounted.
		slot.completion = completion.current;
		slot.images = initialImages.current;
		const groups: number[] = [];
		const creating = !slot.editor;
		slot.editor ??= new TiptapEditor({
			extensions: [
				...createExtensions().map((extension) =>
					extension.name === "image"
						? ImageBlock.configure({ source: () => slot.images ?? null })
						: extension,
				),
				WordComplete.configure({
					enabled: () => slot.completion?.completeOn ?? false,
					rows: () => slot.completion?.links?.completionRows ?? [],
					current: () => slot.completion?.noteId ?? "current",
				}),
			],
			content: ensureUniqueIds(initial.current.doc),
			editable: initial.current.editable,
			onTransaction: ({ editor, transaction }) => {
				const depth = undoDepth(editor.state);
				const previous = groups.length;
				if (isHistoryTransaction(transaction) && depth < previous)
					groups.length = depth;
				else if (
					depth &&
					slot.nextEdit &&
					(depth !== previous ||
						(transaction.docChanged &&
							transaction.getMeta("addToHistory") !== false))
				) {
					// ProseMirror can trim several old groups as it adds a new one.
					if (depth <= previous && depth !== previous)
						groups.splice(0, previous - depth + 1);
					groups[depth - 1] = slot.nextEdit();
				}
				slot.undoSequence = groups.at(-1);
			},
		});
		const editor = slot.editor;
		const first = initial.current.doc.content;
		// A file with no blocks opens with a placeholder paragraph.
		if (
			creating &&
			sharedSlot &&
			first?.length === 1 &&
			first[0]?.type === "paragraph" &&
			!first[0].attrs?.id &&
			!first[0].content?.length
		)
			slot.emptyNote = editor.state.doc;
		const update = () => {
			latest.current(
				slot.emptyNote?.eq(editor.state.doc)
					? { type: "doc", content: [] }
					: editor.getJSON(),
			);
			// Hide on every edit; the extension shows it again on the next hover.
			editor.view.dispatch(editor.state.tr.setMeta("hideDragHandle", true));
		};
		editor.on("update", update);
		setEditor(editor);
		return () => {
			editor.off("update", update);
			if (!sharedSlot) {
				editor.destroy();
				slot.editor = undefined;
			}
		};
	}, [slot, sharedSlot]);

	useLayoutEffect(() => {
		slot.completion = { completeOn, links, noteId };
		slot.images = images;
	}, [slot, completeOn, links, noteId, images]);

	useLayoutEffect(() => {
		if (editor && !editor.isDestroyed) editor.setEditable(editable, false);
	}, [editor, editable]);

	useLayoutEffect(() => {
		if (focusOnAttach && editor?.isEditable) editor.view.focus();
	}, [editor, focusOnAttach]);

	editorRef.current = editor;
	useEffect(() => {
		if (editor && !editor.isDestroyed)
			editor.view.dispatch(
				editor.state.tr.setMeta("wordCompleteEnabled", completeOn),
			);
	}, [editor, completeOn]);

	// The gap and line that show where a carried block would land.
	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		setDropSlot(editor.view, dropIndicator);
	}, [editor, dropIndicator]);

	// The slash menu's "Template" item asks the editor, which asks the app.
	useEffect(() => {
		if (!editor || editor.isDestroyed) return;
		const dom = editor.view.dom;
		dom.dataset.templates = onChooseTemplate ? "on" : "off";
		const ask = () => {
			const handler = chooseTemplate.current;
			if (!handler) return;
			const { doc, selection } = editor.state;
			const { from, to } = selection;
			const caret = editor.view.coordsAtPos(from);
			handler({
				anchor: { left: caret.left, top: caret.top, bottom: caret.bottom },
				selection: selection.empty ? "" : doc.textBetween(from, to, "\n", "\n"),
				insert: (nodes, cursor, replace) =>
					!editor.isDestroyed &&
					editor.isEditable &&
					editor.state.doc === doc &&
					insertBlocksAtCaret(
						editor,
						nodes,
						cursor,
						replace ? { from, to } : undefined,
					),
				focus: () => {
					if (!editor.isDestroyed) editor.commands.focus();
				},
			});
		};
		dom.addEventListener(TEMPLATE_EVENT, ask);
		return () => dom.removeEventListener(TEMPLATE_EVENT, ask);
	}, [editor, onChooseTemplate]);

	useEffect(() => {
		if (editor && !editor.isDestroyed)
			setSlashFeatureCheck(editor, featureOn ?? (() => true));
	}, [editor, featureOn]);

	// Links read what the app knows through the editor's storage, so the
	// picker and the chips always see the latest list without a new editor.
	useEffect(() => {
		if (editor && !editor.isDestroyed)
			setLinkSource(editor, links ?? null, noteId ?? null);
	}, [editor, links, noteId]);

	useEffect(() => {
		if (!editor) return;
		const hide = () => setMovable(null);
		editor.on("update", hide);
		return () => {
			editor.off("update", hide);
		};
	}, [editor]);

	// Whether a right-click landed in a table cell: only then does the table menu
	// replace the system one. Set on the button press, which comes first.
	const [inCell, setInCell] = useState(false);
	const pressRightButton = (event: React.MouseEvent<HTMLElement>) => {
		if (event.button !== 2 || !editor || !editable) return;
		const cell =
			event.target instanceof Element ? event.target.closest("td, th") : null;
		// A database block draws its own table; its cells aren't note table cells.
		const inside =
			cell !== null &&
			editor.view.dom.contains(cell) &&
			cell.closest(".database-block") === null;
		setInCell(inside);
		if (!inside) return;
		// Right-click puts the caret in the cell, unless it is in a selected range of cells.
		const hit = editor.view.posAtCoords({
			left: event.clientX,
			top: event.clientY,
		});
		const { selection } = editor.state;
		const selected =
			"$anchorCell" in selection &&
			hit !== null &&
			selection.from <= hit.pos &&
			hit.pos <= selection.to;
		if (hit && !selected) editor.commands.setTextSelection(hit.pos);
	};

	const trackMovable = (event: React.MouseEvent<HTMLElement>) => {
		if (!editor || !editable || !sectionRef.current) return;
		if (
			event.target instanceof Element &&
			event.target.closest(".move-out-button, .block-drag-handle")
		)
			return;
		const hit = editor.view.posAtCoords({
			left: event.clientX,
			top: event.clientY,
		});
		const found: Movable | null = hit
			? findMovable(
					editor.state.doc,
					hit.inside >= 0 ? hit.inside + 1 : hit.pos,
				)
			: null;
		if (!found) {
			setMovable((current) => (current === null ? current : null));
			return;
		}
		const dom = editor.view.nodeDOM(found.pos);
		if (!(dom instanceof HTMLElement)) return;
		const box = dom.getBoundingClientRect();
		const area = sectionRef.current.getBoundingClientRect();
		const top = box.top - area.top;
		const left = box.right - area.left;
		setMovable((current) =>
			current?.pos === found.pos && current.top === top && current.left === left
				? current
				: { pos: found.pos, from: found.from, top, left },
		);
	};

	const updateDropIndicator = (event: React.DragEvent<HTMLElement>) => {
		if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return;
		event.preventDefault();
		setDragEffect(
			event.dataTransfer,
			"dropEffect",
			event.altKey ? "copy" : "move",
		);
		autoScrollOnDrag(
			event.currentTarget.closest<HTMLElement>(".pane") ?? event.currentTarget,
			event.clientY,
		);
		if (!editor) return;
		const view = editor.view;
		if (view.dragging?.slice) {
			// A block of this note: drop exactly where the editor will drop it, which
			// can be inside another block, and say so.
			const hit = view.posAtCoords({
				left: event.clientX,
				top: event.clientY,
			});
			if (!hit) {
				setDropIndicator(null);
				return;
			}
			const target =
				dropPoint(view.state.doc, hit.pos, view.dragging.slice) ?? hit.pos;
			const $target = view.state.doc.resolve(target);
			const label =
				$target.depth > 0 ? nestLabel($target.parent.type.name) : null;
			setDropIndicator({
				pos: target,
				index: null,
				nest:
					label === null
						? null
						: { from: $target.before(), to: $target.after(), label },
			});
			return;
		}
		const slot = findBlockDropTarget(
			editor.view.dom,
			editor.state.doc,
			event.clientY,
			event.currentTarget,
		);
		let pos = 0;
		for (let i = 0; i < slot.index; i++)
			pos += editor.state.doc.child(i).nodeSize;
		setDropIndicator({ pos, index: slot.index, nest: null });
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild disabled={!inCell}>
				<section
					className="note-editor"
					ref={sectionRef}
					onMouseDownCapture={pressRightButton}
					onMouseMove={trackMovable}
					onMouseLeave={(event) => {
						const next = event.relatedTarget;
						if (next instanceof Element && next.closest(".move-out-button"))
							return;
						setMovable(null);
					}}
					data-undo-note={sharedSlot ? noteId : undefined}
					data-block-dragging={dropIndicator !== null || undefined}
					aria-label="Note editor drop area"
					onDragEnter={updateDropIndicator}
					onDragOver={updateDropIndicator}
					onDragLeave={(event) => {
						const next = event.relatedTarget;
						if (next instanceof Node && event.currentTarget.contains(next))
							return;
						setDropIndicator(null);
					}}
					onDragEnd={() => setDropIndicator(null)}
					onDropCapture={(event) => {
						setDropIndicator(null);
						if (!event.dataTransfer.types.includes(BLOCK_DRAG_TYPE)) return;
						// A block of this note (a list item too): the editor drops it.
						if (blockDragNote(event.dataTransfer) === noteId) return;
						const data = blockDragData(event.dataTransfer);
						event.preventDefault();
						event.stopPropagation();
						if (!editor || !onDropBlock || !data) return;
						const { after, near, start } = findBlockDropTarget(
							editor.view.dom,
							editor.state.doc,
							event.clientY,
							event.currentTarget,
						);
						const slot = { after, near, start };
						void (event.altKey
							? onDropBlock(data.blockId, data.noteId, slot, true)
							: onDropBlock(data.blockId, data.noteId, slot));
					}}
				>
					<EditorContent editor={editor} />
					{editor && editable && (
						<BubbleMenu
							editor={editor}
							options={{ placement: "top", offset: 8 }}
							shouldShow={({ editor: current, state }) =>
								current.isEditable &&
								!state.selection.empty &&
								!current.isActive("codeBlock")
							}
						>
							<FormatBar editor={editor} />
						</BubbleMenu>
					)}
					{editor && editable && movable && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="move-out-button"
									style={{ top: `${movable.top}px`, left: `${movable.left}px` }}
									aria-label={`Move out of ${movable.from}`}
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => {
										moveOut(editor, movable.pos);
										setMovable(null);
									}}
								>
									<CornerLeftUp size={14} aria-hidden="true" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>{`Move out of ${movable.from} (Cmd/Ctrl+Alt+←)`}</TooltipContent>
						</Tooltip>
					)}
					{editor && editable && noteId && (
						<DragHandle
							editor={editor}
							className="block-drag-handle"
							// Near a block's left edge the outer block wins, so a whole
							// list can still be grabbed from its edge.
							nested={{
								defaultRules: false,
								edgeDetection: "left",
								rules: COLUMN_DRAG_RULES,
							}}
							onNodeChange={({ node, pos }) => {
								draggedBlock.current = node;
								draggedPos.current = node ? pos : null;
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
					{editor && editable && (
						<TableEdgeBars editor={editor} section={sectionRef} />
					)}
				</section>
			</ContextMenuTrigger>
			{editor && editable && <TableMenuContent editor={editor} />}
		</ContextMenu>
	);
}
