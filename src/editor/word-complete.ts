import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { Text } from "lucide-react";
import { type CompletionNote, WordIndex } from "../core/complete";
import { createPopup, type PopupItem } from "./slash-menu";

export const WordComplete = Extension.create<{
	rows: () => readonly CompletionNote[];
	enabled: () => boolean;
	current: () => string;
}>({
	name: "wordComplete",
	priority: 10001,
	addOptions: () => ({
		rows: () => [],
		enabled: () => true,
		current: () => "current",
	}),
	addProseMirrorPlugins() {
		const index = new WordIndex();
		const cached = new Map<string, CompletionNote>();
		return [
			Suggestion<PopupItem>({
				editor: this.editor,
				pluginKey: new PluginKey("wordComplete"),
				findSuggestionMatch: ({ $position }) => {
					if (!this.options.enabled()) return null;
					const before = $position.parent.textBetween(
						0,
						$position.parentOffset,
						undefined,
						"\ufffc",
					);
					const match = /(?:^|\s)([\p{L}\p{M}]{3,})$/u.exec(before);
					if (!match || /(?:\/|\[\[|@)\S*$/.test(before)) return null;
					const text = match[1];
					if (!text) return null;
					return {
						range: { from: $position.pos - text.length, to: $position.pos },
						query: text,
						text,
					};
				},
				allow: ({ editor, state, range }) => {
					const pos = state.doc.resolve(range.from);
					for (let d = pos.depth; d > 0; d--)
						if (/code|math/i.test(pos.node(d).type.name)) return false;
					return !editor.isActive("code");
				},
				items: ({ query, editor }) => {
					const rows = this.options.rows();
					const ids = new Set(rows.map((r) => r.id ?? r.path));
					for (const id of cached.keys())
						if (!ids.has(id)) {
							index.remove(id);
							cached.delete(id);
						}
					for (const row of rows) {
						const id = row.id ?? row.path;
						const old = cached.get(id);
						if (old?.text !== row.text || old?.title !== row.title) {
							index.update(id, row.text ?? "", row.title);
							cached.set(id, row);
						}
					}
					const current = this.options.current();
					index.update(
						current,
						editor.getText(),
						rows.find((r) => (r.id ?? r.path) === current)?.title,
					);
					return index.suggest(query, current).map((label) => ({
						id: label,
						label,
						section: "Complete",
						icon: Text,
					}));
				},
				command: ({ editor, range, props }) => {
					const typed = editor.state.doc.textBetween(range.from, range.to);
					const chars = [...props.label];
					let end = 0,
						letters = 0;
					while (
						end < chars.length &&
						letters < [...typed.normalize("NFD").replace(/\p{M}/gu, "")].length
					) {
						if (!/\p{M}/u.test(chars[end])) letters++;
						end++;
					}
					while (end < chars.length && /\p{M}/u.test(chars[end])) end++;
					editor.commands.insertContentAt(range.to, chars.slice(end).join(""));
				},
				render: () => {
					const popup = createPopup<PopupItem>({
						quietWhenEmpty: () => true,
						className: "word-complete",
					});
					// Tab accepts. Enter accepts only after the arrows picked a row, so
					// finishing a word and pressing Enter still starts a new line.
					let picked = false;
					return {
						onStart: (p) => {
							picked = false;
							popup.mount(p);
						},
						onUpdate: (p) => {
							picked = false;
							popup.update(p);
						},
						onKeyDown: ({ event }) => {
							if (event.key === "ArrowDown" || event.key === "ArrowUp")
								picked = true;
							else if (event.key === "Enter" && !picked) return false;
							return popup.key(event);
						},
						onExit: () => popup.destroy(),
					};
				},
			}),
		];
	},
});
