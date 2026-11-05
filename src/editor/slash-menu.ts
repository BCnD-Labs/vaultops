import { Extension } from "@tiptap/core";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { placeMenu } from "./menu-placement";
import { filterSlashItems, type SlashItem } from "./slash-items";

const iconMarkup = new Map<SlashItem["icon"], string>();
function iconHtml(icon: SlashItem["icon"]): string {
	let html = iconMarkup.get(icon);
	if (html === undefined) {
		html = renderToStaticMarkup(createElement(icon, { "aria-hidden": true }));
		iconMarkup.set(icon, html);
	}
	return html;
}

/**
 * The popup: a plain DOM list, no framework, placed under the caret, or above
 * it when it would run off the bottom of the window.
 */
export function createPopup() {
	const root = document.createElement("div");
	root.className = "slash-menu";
	root.setAttribute("role", "listbox");
	let items: SlashItem[] = [];
	let selected = 0;
	let choose: (item: SlashItem) => void = () => {};

	const paint = () => {
		root.replaceChildren();
		if (items.length === 0) {
			const none = document.createElement("div");
			none.className = "slash-menu-empty";
			none.textContent = "No matches";
			root.append(none);
			return;
		}
		let lastSection: string | null = null;
		const rows: HTMLElement[] = [];
		items.forEach((item, index) => {
			if (item.section !== lastSection) {
				const heading = document.createElement("div");
				heading.className = "slash-menu-section";
				heading.setAttribute("role", "presentation");
				heading.textContent = item.section;
				root.append(heading);
				lastSection = item.section;
			}
			const button = document.createElement("button");
			button.type = "button";
			button.className = "slash-menu-item";
			button.setAttribute("role", "option");
			button.setAttribute("aria-selected", String(index === selected));
			button.dataset["id"] = item.id;
			const icon = document.createElement("span");
			icon.className = "slash-menu-icon";
			icon.innerHTML = iconHtml(item.icon);
			const label = document.createElement("span");
			label.className = "slash-menu-label";
			label.textContent = item.label;
			button.append(icon, label);
			if (item.hint) {
				const hint = document.createElement("kbd");
				hint.className = "slash-menu-hint";
				hint.textContent = item.hint;
				button.append(hint);
			}
			// mousedown keeps the editor focused; click would blur it first.
			button.addEventListener("mousedown", (event) => {
				event.preventDefault();
				choose(item);
			});
			root.append(button);
			rows.push(button);
		});
		// With a long list the menu scrolls: keep the chosen item in view.
		const current = rows[selected];
		current?.scrollIntoView?.({ block: "nearest" });
	};

	const place = (props: SuggestionProps<SlashItem>) => {
		const rect = props.clientRect?.();
		if (!rect) return;
		// Measure the whole menu, not the height an earlier placement capped it to.
		root.style.maxHeight = "";
		const placed = placeMenu(
			rect,
			{ width: root.offsetWidth, height: root.offsetHeight },
			{ width: window.innerWidth, height: window.innerHeight },
		);
		root.style.left = `${placed.left}px`;
		// Never taller than the menu's own cap (see editor.css), or the window allows.
		root.style.maxHeight = `min(${placed.maxHeight}px, var(--slash-menu-max-height))`;
		root.dataset.side = placed.side;
		if (placed.side === "above") {
			root.style.top = "";
			root.style.bottom = `${placed.offset}px`;
		} else {
			root.style.bottom = "";
			root.style.top = `${placed.offset}px`;
		}
	};

	return {
		update(props: SuggestionProps<SlashItem>) {
			items = props.items;
			choose = (item) => props.command(item);
			selected = Math.min(selected, Math.max(items.length - 1, 0));
			paint();
			place(props);
		},
		mount(props: SuggestionProps<SlashItem>) {
			selected = 0;
			document.body.append(root);
			this.update(props);
		},
		key(event: KeyboardEvent): boolean {
			if (items.length === 0) return false;
			if (event.key === "ArrowDown") {
				selected = (selected + 1) % items.length;
			} else if (event.key === "ArrowUp") {
				selected = (selected - 1 + items.length) % items.length;
			} else if (event.key === "Enter") {
				const item = items[selected];
				if (item) choose(item);
				return true;
			} else {
				return false;
			}
			paint();
			return true;
		},
		destroy() {
			root.remove();
		},
	};
}

/**
 * Typing `/` at the start of a block or after a space opens the block menu.
 * Arrow keys and Enter choose, Escape closes. A slash inside a word does not
 * open it.
 */
export const SlashMenu = Extension.create({
	name: "slashMenu",

	addProseMirrorPlugins() {
		return [
			Suggestion<SlashItem, SlashItem>({
				editor: this.editor,
				char: "/",
				allowedPrefixes: [" "],
				items: ({ query }) => filterSlashItems(query),
				command: ({ editor, range, props }) => props.run(editor, range),
				render: () => {
					const popup = createPopup();
					return {
						onStart: (props) => popup.mount(props),
						onUpdate: (props) => popup.update(props),
						onKeyDown: ({ event }: SuggestionKeyDownProps) => popup.key(event),
						onExit: () => popup.destroy(),
					};
				},
			}),
		];
	},
});
