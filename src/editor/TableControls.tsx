import type { Editor } from "@tiptap/core";
import { Plus } from "lucide-react";
import { Fragment, type RefObject, useEffect, useRef, useState } from "react";
import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
	addColumnAtEnd,
	addRowAtEnd,
	TABLE_MENU_ACTIONS,
	tablePosOf,
} from "./table-controls";

interface Box {
	top: number;
	left: number;
	width: number;
	height: number;
}

/**
 * Thin "+" bars along the right and bottom edges of the table under the
 * pointer: click one to add a column or a row at the end. They only exist
 * while the editor is editable and the pointer is over a table (or a bar).
 * Positions are measured against `section`, the editor's positioned wrapper
 * (a ref, since it is set once the editor has mounted).
 */
export function TableEdgeBars({
	editor,
	section,
}: {
	editor: Editor;
	section: RefObject<HTMLElement | null>;
}) {
	const [box, setBox] = useState<Box | null>(null);
	const table = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const area = section.current;
		if (!area) return;
		const measure = () => {
			const element = table.current;
			if (!element?.isConnected) {
				table.current = null;
				setBox(null);
				return;
			}
			const rect = element.getBoundingClientRect();
			const origin = area.getBoundingClientRect();
			const next = {
				top: rect.top - origin.top,
				left: rect.left - origin.left,
				width: rect.width,
				height: rect.height,
			};
			setBox((was) =>
				was &&
				was.top === next.top &&
				was.left === next.left &&
				was.width === next.width &&
				was.height === next.height
					? was
					: next,
			);
		};
		const onMove = (event: MouseEvent) => {
			if (!editor.isEditable || !(event.target instanceof Element)) return;
			if (event.target.closest(".table-edge-bar")) return;
			// A database block's table has its own controls.
			const found = event.target.closest("table:not(.db-table)");
			if (found instanceof HTMLElement && editor.view.dom.contains(found)) {
				table.current = found;
				measure();
			} else if (table.current) {
				table.current = null;
				setBox(null);
			}
		};
		const onLeave = (event: MouseEvent) => {
			const next = event.relatedTarget;
			if (next instanceof Element && next.closest(".table-edge-bar")) return;
			table.current = null;
			setBox(null);
		};
		area.addEventListener("mousemove", onMove);
		area.addEventListener("mouseleave", onLeave);
		// A new row or column moves the edges; follow them.
		editor.on("update", measure);
		return () => {
			area.removeEventListener("mousemove", onMove);
			area.removeEventListener("mouseleave", onLeave);
			editor.off("update", measure);
		};
	}, [editor, section]);

	if (!box || !editor.isEditable) return null;

	const add = (adder: typeof addRowAtEnd) => {
		const pos = table.current ? tablePosOf(editor, table.current) : null;
		if (pos !== null) adder(editor, pos);
	};
	// Pressing a bar must not take the caret out of the note.
	const keepCaret = (event: React.MouseEvent) => event.preventDefault();
	return (
		<>
			<button
				type="button"
				className="table-edge-bar table-edge-bar-column"
				aria-label="Add column"
				title="Add column"
				style={{ top: box.top, left: box.left + box.width, height: box.height }}
				onMouseDown={keepCaret}
				onClick={() => add(addColumnAtEnd)}
			>
				<Plus aria-hidden="true" size={12} />
			</button>
			<button
				type="button"
				className="table-edge-bar table-edge-bar-row"
				aria-label="Add row"
				title="Add row"
				style={{ top: box.top + box.height, left: box.left, width: box.width }}
				onMouseDown={keepCaret}
				onClick={() => add(addRowAtEnd)}
			>
				<Plus aria-hidden="true" size={12} />
			</button>
		</>
	);
}

/** The right-click menu for a table cell; each item works on the caret's cell. */
export function TableMenuContent({ editor }: { editor: Editor }) {
	return (
		<ContextMenuContent
			aria-label="Table"
			// Hand the caret back to the note instead of the page behind it.
			onCloseAutoFocus={(event) => {
				event.preventDefault();
				if (!editor.isDestroyed) editor.commands.focus();
			}}
		>
			{TABLE_MENU_ACTIONS.map((action) => (
				<Fragment key={action.id}>
					<ContextMenuItem
						variant={action.danger ? "destructive" : "default"}
						disabled={!action.can(editor)}
						onSelect={() => action.run(editor)}
					>
						{action.label}
					</ContextMenuItem>
					{action.after && <ContextMenuSeparator />}
				</Fragment>
			))}
		</ContextMenuContent>
	);
}
