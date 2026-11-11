import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** Where a carried block would land, and the block it would end up inside, if any. */
export interface DropSlotState {
	/** Document position of the gap. */
	pos: number;
	/** Root-block index, for a block from another document. */
	index: number | null;
	/** The block that would hold it: its range and the word for it. */
	nest: { from: number; to: number; label: string } | null;
}

export const dropSlotKey = new PluginKey<DropSlotState | null>("dropSlot");
export const DROP_SLOT_CLASS = "block-drop-slot";

const same = (a: DropSlotState | null, b: DropSlotState | null) =>
	a === b ||
	(a !== null &&
		b !== null &&
		a.pos === b.pos &&
		a.index === b.index &&
		a.nest?.from === b.nest?.from &&
		a.nest?.to === b.nest?.to);

/** Show or clear the slot a carried block would land in. */
export function setDropSlot(view: EditorView, slot: DropSlotState | null) {
	if (same(dropSlotKey.getState(view.state) ?? null, slot)) return;
	view.dispatch(view.state.tr.setMeta(dropSlotKey, slot));
}

function slotElement(slot: DropSlotState): HTMLElement {
	const element = document.createElement("div");
	element.className = DROP_SLOT_CLASS;
	element.contentEditable = "false";
	element.setAttribute("data-testid", "block-drop-indicator");
	element.dataset.dropIndex = String(slot.index ?? "");
	element.dataset.nested = String(slot.nest !== null);
	const line = document.createElement("div");
	line.className = "block-drop-slot-line";
	element.append(line);
	return element;
}

/**
 * While a block is carried over the note, a line appears between the blocks at
 * the slot it would land in. The line is a real element in the flow, so the
 * blocks above and below move a little to make room. If the slot is inside
 * another block (a list item, quote, callout, toggle), that block is outlined
 * and named, so nesting never comes as a surprise.
 */
export const DropSlot = Extension.create({
	name: "dropSlot",
	addProseMirrorPlugins() {
		return [
			new Plugin<DropSlotState | null>({
				key: dropSlotKey,
				state: {
					init: () => null,
					apply(tr, value) {
						const meta = tr.getMeta(dropSlotKey);
						if (meta !== undefined) return meta as DropSlotState | null;
						return tr.docChanged ? null : value;
					},
				},
				props: {
					decorations(state) {
						const slot = dropSlotKey.getState(state);
						if (!slot) return null;
						const decorations = [
							Decoration.widget(slot.pos, () => slotElement(slot), {
								side: -1,
								key: `drop-slot-${slot.pos}-${slot.nest ? "n" : "r"}`,
								ignoreSelection: true,
							}),
						];
						if (slot.nest)
							decorations.push(
								Decoration.node(slot.nest.from, slot.nest.to, {
									class: "drop-nest-target",
									"data-nest-label": `Nest in ${slot.nest.label}`,
								}),
							);
						return DecorationSet.create(state.doc, decorations);
					},
				},
			}),
		];
	},
});
