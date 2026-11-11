import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { isTone, TONES, type Tone } from "../app/appearance";

export const QUOTE_COLORS = TONES;
export type QuoteBarColor = Tone;

export function quoteColorOf(value: unknown): QuoteBarColor | null {
	return isTone(value) ? value : null;
}

export const quoteColorKey = new PluginKey("quoteColor");

function closeOpenPickers(dom: HTMLElement, except?: Element | null) {
	for (const picker of dom.querySelectorAll<HTMLElement>(
		'.quote-bar-picker[data-open="true"]',
	)) {
		if (except && picker === except) continue;
		const menu = picker.querySelector<HTMLElement>(".quote-color-popover");
		const handle = picker.querySelector<HTMLElement>(".quote-color-handle");
		if (menu) menu.hidden = true;
		handle?.setAttribute("aria-expanded", "false");
		delete picker.dataset.open;
	}
}

function openPicker(picker: HTMLElement, open: boolean) {
	const menu = picker.querySelector<HTMLElement>(".quote-color-popover");
	const handle = picker.querySelector<HTMLElement>(".quote-color-handle");
	if (menu) menu.hidden = !open;
	handle?.setAttribute("aria-expanded", String(open));
	if (open) picker.dataset.open = "true";
	else delete picker.dataset.open;
}

function buildQuotePicker(
	view: EditorView,
	getPos: () => number | undefined,
	current: QuoteBarColor | null,
): HTMLElement {
	const picker = document.createElement("div");
	picker.className = "quote-bar-picker";
	picker.contentEditable = "false";

	const handle = document.createElement("button");
	handle.type = "button";
	handle.className = "quote-color-handle";
	if (current) handle.dataset.tone = current;
	handle.setAttribute("aria-label", "Quote bar colour");
	handle.setAttribute("aria-expanded", "false");
	handle.title = "Quote bar colour";

	const menu = document.createElement("div");
	menu.className = "quote-color-popover style-swatches";
	menu.setAttribute("role", "group");
	menu.setAttribute("aria-label", "Quote bar colour");
	menu.hidden = true;

	const pick = (next: QuoteBarColor | null) => {
		const at = getPos();
		if (at === undefined) return;
		const target = view.state.doc.nodeAt(at - 1);
		if (!target || target.type.name !== "blockquote") return;
		openPicker(picker, false);
		view.dispatch(
			view.state.tr.setNodeMarkup(at - 1, undefined, {
				...target.attrs,
				color: next,
			}),
		);
	};

	const none = document.createElement("button");
	none.type = "button";
	none.className = "style-swatch style-swatch-none";
	none.setAttribute("aria-label", "No colour");
	none.setAttribute("aria-pressed", String(current === null));
	none.title = "No colour";
	none.addEventListener("click", () => pick(null));
	menu.append(none);

	for (const tone of TONES) {
		const swatch = document.createElement("button");
		swatch.type = "button";
		swatch.className = "style-swatch";
		swatch.dataset.tone = tone;
		swatch.setAttribute("aria-label", `Colour ${tone}`);
		swatch.setAttribute("aria-pressed", String(current === tone));
		swatch.title = tone;
		swatch.addEventListener("click", () => pick(tone));
		menu.append(swatch);
	}

	handle.addEventListener("click", () => {
		const nextOpen = Boolean(menu.hidden);
		closeOpenPickers(view.dom, picker);
		openPicker(picker, nextOpen);
	});

	picker.append(handle, menu);
	return picker;
}

/**
 * Adds the optional `color` attribute on `blockquote` (left out when null) and
 * a swatch picker opened from the quote's top-right handle or right-click.
 */
export const QuoteColor = Extension.create({
	name: "quoteColor",

	addGlobalAttributes() {
		return [
			{
				types: ["blockquote"],
				attributes: {
					color: {
						default: null,
						parseHTML: (element) =>
							quoteColorOf(element.getAttribute("data-color")),
						renderHTML: (attributes) => {
							const color = quoteColorOf(attributes.color);
							return color ? { "data-color": color, "data-tone": color } : {};
						},
					},
				},
			},
		];
	},

	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				key: quoteColorKey,
				props: {
					decorations(state) {
						if (!editor.isEditable) return null;
						const decorations: Decoration[] = [];
						state.doc.descendants((node, pos) => {
							if (node.type.name !== "blockquote") return true;
							const current = quoteColorOf(node.attrs.color);
							decorations.push(
								Decoration.widget(
									pos + 1,
									(view, getPos) => buildQuotePicker(view, getPos, current),
									{
										side: -1,
										key: `quote-color-${pos}-${current ?? "default"}`,
										stopEvent: () => true,
										ignoreSelection: true,
									},
								),
							);
							return true;
						});
						return DecorationSet.create(state.doc, decorations);
					},
					handleDOMEvents: {
						mousedown(view, event) {
							if (
								event.target instanceof Element &&
								event.target.closest(".quote-bar-picker")
							) {
								return false;
							}
							closeOpenPickers(view.dom);
							return false;
						},
						contextmenu(view, event) {
							if (!editor.isEditable || !(event.target instanceof Element))
								return false;
							const quote = event.target.closest("blockquote");
							if (!quote || !view.dom.contains(quote)) return false;
							const picker = [...quote.children].find(
								(el): el is HTMLElement =>
									el instanceof HTMLElement &&
									el.classList.contains("quote-bar-picker"),
							);
							if (!picker) return false;
							event.preventDefault();
							closeOpenPickers(view.dom, picker);
							openPicker(picker, true);
							return true;
						},
					},
				},
			}),
		];
	},
});
