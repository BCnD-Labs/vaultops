import { Extension } from "@tiptap/core";
import Suggestion, {
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import { filterSlashItems, type SlashItem } from "./slash-items";

/** The popup: a plain DOM list, no framework, placed under the caret. */
function createPopup() {
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
		items.forEach((item, index) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "slash-menu-item";
			button.setAttribute("role", "option");
			button.setAttribute("aria-selected", String(index === selected));
			button.textContent = item.label;
			// mousedown keeps the editor focused; click would blur it first.
			button.addEventListener("mousedown", (event) => {
				event.preventDefault();
				choose(item);
			});
			root.append(button);
		});
	};

	const place = (props: SuggestionProps<SlashItem>) => {
		const rect = props.clientRect?.();
		if (!rect) return;
		root.style.left = `${rect.left}px`;
		root.style.top = `${rect.bottom + 4}px`;
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
