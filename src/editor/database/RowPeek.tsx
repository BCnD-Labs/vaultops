import type { Editor, Extensions, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { FileText, Unlink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { noteTitleFor } from "../../core/notes/row-notes";
import { ensureUniqueIds } from "../ids";
import { useLinkSource } from "../note-link";
import { Cell } from "./cells";
import {
	linkRowToNote,
	pageBlocks,
	setCell,
	setOptionCell,
	setRowContent,
	unlinkRow,
} from "./commands";
import { TYPE_ICONS } from "./icons";
import {
	type Cells,
	COLUMN_TYPE_LABELS,
	type DbColumn,
	TITLE_ID,
} from "./model";

export interface PeekRow {
	id: string;
	cells: Cells;
	content: JSONContent[];
	/** The note this row was turned into, or null. */
	noteId: string | null;
}

interface RowPeekProps {
	editor: Editor;
	row: PeekRow;
	columns: DbColumn[];
	/** The database's position now (it moves as the note is edited). */
	dbPos: () => number | undefined;
	pageExtensions: Extensions;
	onClose: () => void;
}

const WHY_NOT_LINKED = {
	"not-editable": "This note is read-only, so the row was not changed.",
	"row-gone": "The row is gone, so it was not changed.",
	"page-changed":
		"The page changed while the note was being made, so the row was not changed. The note was made; try again or delete it.",
} as const;

/**
 * A row's page in a side panel over the note, like AFFiNE's and Notion's side
 * peek: the title, every other column as a property, then the row's own
 * blocks in a small editor of their own. Every edit is written straight back
 * into the note as one step, so autosave and undo work as for any block.
 * A row can be turned into a note: it then keeps its place and properties in
 * the database, and the page is the note's. Escape or a click beside the
 * panel closes it.
 */
export function RowPeek({
	editor,
	row,
	columns,
	dbPos,
	pageExtensions,
	onClose,
}: RowPeekProps) {
	const editable = editor.isEditable;
	const rowId = row.id;
	const panel = useRef<HTMLElement>(null);
	const title = columns.find((c) => c.id === TITLE_ID);
	const source = useLinkSource(editor);
	const noteActions = source?.rowNotes;
	const [making, setMaking] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	// The note's name now; null once it is gone (deleted or in the trash).
	const noteName =
		row.noteId && source ? source.describe("note", row.noteId) : null;
	const noteGone = row.noteId !== null && source !== null && noteName === null;

	// The page editor starts from the row's blocks once; after that it is the
	// one being typed in, and the note follows it.
	const page = useEditor({
		extensions: pageExtensions,
		editable,
		content: ensureUniqueIds({
			type: "doc",
			content: row.content.length > 0 ? row.content : [{ type: "paragraph" }],
		}),
		onUpdate: ({ editor: inner }) => {
			setRowContent(editor, rowId, inner.getJSON().content ?? []);
		},
	});

	// Locked while the note is being made, so nothing typed is left behind.
	useEffect(() => {
		page?.setEditable(editable && !making && row.noteId === null);
	}, [page, editable, making, row.noteId]);

	// After "Unlink" the row has no page: start the editor empty again.
	const linked = row.noteId !== null;
	const wasLinked = useRef(linked);
	useEffect(() => {
		if (wasLinked.current && !linked) {
			page?.commands.setContent(
				ensureUniqueIds({ type: "doc", content: [{ type: "paragraph" }] }),
				{ emitUpdate: false },
			);
		}
		wasLinked.current = linked;
	}, [page, linked]);

	useEffect(() => {
		// Checked before anything else sees the key: the editor marks every
		// Escape as handled, so a later listener can't tell whether a menu used it.
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			// An open menu (slash menu, option picker, column menu) closes first.
			const menuOpen = document.querySelector(
				".slash-menu, [data-radix-popper-content-wrapper]",
			);
			if (!menuOpen) onClose();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [onClose]);

	useEffect(() => {
		panel.current?.focus();
	}, []);

	const change = (column: DbColumn) => ({
		onChange: (value: Parameters<typeof setCell>[3]) =>
			setCell(editor, rowId, column.id, value),
		onOptionChange: (next: DbColumn, value: Parameters<typeof setCell>[3]) => {
			const pos = dbPos();
			if (pos !== undefined) setOptionCell(editor, pos, rowId, next, value);
		},
	});

	/**
	 * The note is made first; only when it is saved does the row give up its
	 * page. If making it fails, the row and its page are exactly as they were.
	 */
	const turnIntoNote = async () => {
		if (!noteActions || making || linked) return;
		setMaking(true);
		setProblem(null);
		try {
			const content = page?.getJSON().content ?? [];
			const made = await noteActions.create({
				from: editor.storage.noteLink.self,
				title: noteTitleFor(String(row.cells[TITLE_ID] ?? "")),
				content: pageBlocks(content),
			});
			if (!made.ok) {
				setProblem(made.message);
				return;
			}
			const result = linkRowToNote(editor, rowId, made.target, content);
			if (result !== "linked" && result !== "already-a-note")
				setProblem(WHY_NOT_LINKED[result]);
		} catch (error) {
			setProblem(
				error instanceof Error ? error.message : "The note was not made.",
			);
		} finally {
			setMaking(false);
		}
	};

	return createPortal(
		<div className="db-peek-layer">
			<button
				type="button"
				className="db-peek-backdrop"
				aria-label="Close row page"
				tabIndex={-1}
				onClick={onClose}
			/>
			<aside
				ref={panel}
				className="db-peek"
				aria-label="Row page"
				tabIndex={-1}
			>
				<header className="db-peek-bar">
					{editable && noteActions && !linked && (
						<button
							type="button"
							className="db-peek-action"
							disabled={making}
							onClick={() => void turnIntoNote()}
						>
							<FileText aria-hidden="true" />
							{making ? "Making note…" : "Turn into note"}
						</button>
					)}
					<button
						type="button"
						className="db-icon-button"
						aria-label="Close"
						title="Close (Esc)"
						onClick={onClose}
					>
						<X aria-hidden="true" />
					</button>
				</header>
				<div className="db-peek-body">
					{title && (
						<div className="db-peek-title">
							<Cell
								column={title}
								cells={row.cells}
								editable={editable}
								placeholder="Untitled"
								{...change(title)}
							/>
						</div>
					)}
					<dl className="db-peek-props">
						{columns
							.filter((c) => c.id !== TITLE_ID)
							.map((column) => (
								<div className="db-peek-prop" key={column.id}>
									<dt title={COLUMN_TYPE_LABELS[column.type]}>
										{(() => {
											const Icon = TYPE_ICONS[column.type];
											return <Icon aria-hidden="true" />;
										})()}
										<span>{column.name || "Untitled"}</span>
									</dt>
									<dd>
										<Cell
											column={column}
											cells={row.cells}
											editable={editable}
											{...change(column)}
										/>
									</dd>
								</div>
							))}
					</dl>
					{problem && (
						<p className="db-peek-problem" role="alert">
							{problem}
						</p>
					)}
					{linked ? (
						<div className="db-peek-note">
							<FileText aria-hidden="true" />
							{noteGone ? (
								<span>Note not found. It may be in the trash.</span>
							) : (
								<span>
									This row is the note <strong>{noteName ?? "…"}</strong>
								</span>
							)}
							{!noteGone && row.noteId && (
								<button
									type="button"
									className="db-peek-action"
									onClick={() =>
										source?.open({
											kind: "note",
											target: row.noteId ?? "",
											label: noteName ?? "",
										})
									}
								>
									Open note
								</button>
							)}
							{editable && (
								<button
									type="button"
									className="db-peek-action"
									onClick={() => unlinkRow(editor, rowId)}
								>
									<Unlink aria-hidden="true" />
									Unlink
								</button>
							)}
						</div>
					) : (
						<div className="note-editor db-peek-page">
							<EditorContent editor={page} />
						</div>
					)}
				</div>
			</aside>
		</div>,
		document.body,
	);
}
