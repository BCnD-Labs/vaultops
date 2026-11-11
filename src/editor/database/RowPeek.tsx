import type { Editor, Extensions, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ensureUniqueIds } from "../ids";
import { Cell } from "./cells";
import { setCell, setOptionCell, setRowContent } from "./commands";
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

/**
 * A row's page in a side panel over the note, like AFFiNE's and Notion's side
 * peek: the title, every other column as a property, then the row's own
 * blocks in a small editor of their own. Every edit is written straight back
 * into the note as one step, so autosave and undo work as for any block.
 * Escape or a click beside the panel closes it.
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
					<div className="note-editor db-peek-page">
						<EditorContent editor={page} />
					</div>
				</div>
			</aside>
		</div>,
		document.body,
	);
}
