import { type Editor, Extension, mergeAttributes, Node } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps } from "@tiptap/suggestion";
import { Contact, FileText, LayoutDashboard } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
	isLinkKind,
	LINK_NODE,
	LINK_SECTIONS,
	type LinkKind,
	type LinkRef,
	type LinkTarget,
} from "../core/links/links";
import { createPopup, type PopupItem } from "./slash-menu";

/**
 * What the editor knows about the rest of the vault. The app supplies it; the
 * editor does no file access of its own. Without one, `[[` and `@` do nothing
 * and links show the name they were saved with.
 */
export interface LinkSource {
	/** What the picker offers for what was typed; `resource` is the `@` shortcut. */
	search: (query: string, scope: "all" | "resource") => LinkTarget[];
	/** The target's name now, or null when it can't be found any more. */
	describe: (kind: LinkKind, target: string) => string | null;
	/** Open the target: a note or canvas in a tab, a resource in the manager. */
	open: (link: LinkRef) => void;
}

/** What the editor keeps for links: the app's source, and who is listening for it to change. */
interface LinkStorage {
	source: LinkSource | null;
	/** The note being edited, which `[[` does not offer to link to itself. */
	self: string | null;
	version: number;
	listeners: Set<() => void>;
}

declare module "@tiptap/core" {
	interface Storage {
		noteLink: LinkStorage;
	}
}

/** Give the editor a new source, and tell every link on screen to look again. */
export function setLinkSource(
	editor: Editor,
	source: LinkSource | null,
	self: string | null = null,
) {
	const storage = editor.storage.noteLink;
	if (storage.source === source && storage.self === self) return;
	storage.source = source;
	storage.self = self;
	storage.version += 1;
	for (const listener of storage.listeners) listener();
}

const ICONS = {
	note: FileText,
	canvas: LayoutDashboard,
	resource: Contact,
} as const;

/** The icon that goes with a kind of link, in the picker and in the text. */
export const linkIcon = (kind: LinkKind) => ICONS[kind];

interface LinkItem extends PopupItem {
	link: LinkTarget;
}

function toItem(link: LinkTarget): LinkItem {
	return {
		id: `${link.kind}:${link.target}`,
		label: link.label,
		section: LINK_SECTIONS[link.kind],
		icon: ICONS[link.kind],
		hint: link.hint,
		link,
	};
}

function LinkView({ node, editor, getPos }: NodeViewProps) {
	const storage = editor.storage.noteLink;
	// Look again whenever the app's list of notes and cards changes, so a renamed
	// or trashed target shows at once, not after the note is reopened.
	useSyncExternalStore(
		(listener) => {
			storage.listeners.add(listener);
			return () => storage.listeners.delete(listener);
		},
		() => storage.version,
	);
	const [asking, setAsking] = useState(false);
	const kind = isLinkKind(node.attrs.kind) ? node.attrs.kind : "note";
	const target = String(node.attrs.target ?? "");
	const saved = String(node.attrs.label ?? "");
	const source = storage.source;
	// The name it has now, so a renamed note reads right; the saved name when
	// there is no source to ask.
	const current = source ? source.describe(kind, target) : saved;
	const missing = source !== null && current === null;
	const Icon = ICONS[kind];
	const place = () => {
		const pos = getPos();
		return typeof pos === "number" ? pos : null;
	};
	const replace = (content: { type: "text"; text: string } | null) => {
		const pos = place();
		if (pos === null) return;
		const chain = editor.chain().focus();
		if (content) chain.insertContentAt({ from: pos, to: pos + 1 }, content);
		else chain.deleteRange({ from: pos, to: pos + 1 });
		chain.run();
	};
	return (
		<NodeViewWrapper as="span" className="note-link" contentEditable={false}>
			<button
				type="button"
				className="note-link-chip"
				data-kind={kind}
				data-missing={missing ? "true" : undefined}
				title={missing ? "This is gone. Click for what you can do." : undefined}
				onClick={() => {
					if (missing) setAsking((on) => !on);
					else source?.open({ kind, target, label: saved });
				}}
			>
				<Icon aria-hidden="true" />
				<span>{current ?? saved}</span>
			</button>
			{missing && asking && (
				<fieldset className="note-link-gone" aria-label="Gone link">
					<span>No longer in this vault.</span>
					{editor.isEditable && (
						<>
							<button
								type="button"
								onClick={() => replace({ type: "text", text: saved })}
							>
								Keep the name as text
							</button>
							<button type="button" onClick={() => replace(null)}>
								Remove link
							</button>
						</>
					)}
					<button type="button" onClick={() => setAsking(false)}>
						Close
					</button>
				</fieldset>
			)}
		</NodeViewWrapper>
	);
}

/**
 * A link to a note, canvas or resource inside a line of text. Saved as an
 * inline item `{"type":"noteLink","attrs":{"kind":"resource","target":"<noteId>","label":"Sam"}}`
 * inside the block's `content`. It points at the target's `noteId`, so renaming
 * or moving the target does not break it; `label` is only the name it had
 * when made. An older build that does not know it opens the note read-only
 * (`checkBlocks`).
 */
export const NoteLink = Node.create({
	name: LINK_NODE,
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,

	addStorage() {
		return {
			source: null as LinkSource | null,
			self: null as string | null,
			version: 0,
			listeners: new Set<() => void>(),
		};
	},

	// Copied as plain text, a link is the name it shows.
	renderText({ node }) {
		return String(node.attrs.label ?? "");
	},

	addAttributes() {
		return {
			kind: { default: "note" },
			target: { default: "" },
			label: { default: "" },
		};
	},

	parseHTML() {
		return [{ tag: 'span[data-type="note-link"]' }];
	},

	renderHTML({ node, HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-type": "note-link",
				"data-kind": node.attrs.kind,
				"data-target": node.attrs.target,
			}),
			String(node.attrs.label ?? ""),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(LinkView, { as: "span" } as never);
	},
});

function linkMenu(
	editor: Editor,
	key: string,
	char: string,
	scope: "all" | "resource",
	options: { allowSpaces: boolean; allowedPrefixes: string[] | null },
) {
	return Suggestion<LinkItem, LinkItem>({
		editor,
		pluginKey: new PluginKey(key),
		char,
		allowSpaces: options.allowSpaces,
		allowedPrefixes: options.allowedPrefixes,
		allow: ({ editor: current }) =>
			current.isEditable && current.storage.noteLink.source !== null,
		items: ({ query, editor: current }) => {
			const { source, self } = current.storage.noteLink;
			if (!source) return [];
			// A closing ]] typed by habit is not part of the name.
			const typed = query.replace(/\]+$/, "");
			return source
				.search(typed, scope)
				.filter((link) => link.target !== self)
				.map(toItem);
		},
		command: ({ editor: current, range, props }) => {
			const { kind, target, label } = props.link;
			current
				.chain()
				.focus()
				.insertContentAt(range, [
					{ type: LINK_NODE, attrs: { kind, target, label } },
					{ type: "text", text: " " },
				])
				.run();
		},
		render: () => {
			// With nothing to offer, a name with a space in it is just prose.
			const popup = createPopup<LinkItem>({
				quietWhenEmpty: (typed) =>
					/\s/.test(typed.trim()) || typed !== typed.trimStart(),
			});
			return {
				onStart: (props) => popup.mount(props),
				onUpdate: (props) => popup.update(props),
				onKeyDown: ({ event }: SuggestionKeyDownProps) => popup.key(event),
				onExit: () => popup.destroy(),
			};
		},
	});
}

/**
 * `[[` opens a picker over notes, canvases and resources; `@` is the shortcut
 * that lists resources only. `{{ }}` is left alone: templates use it for
 * placeholders. Escape closes either and leaves the typed text as it was.
 */
export const LinkMenu = Extension.create({
	name: "linkMenu",
	// Above the blocks that claim Enter (task, toggle, callout).
	priority: 10000,

	addProseMirrorPlugins() {
		return [
			linkMenu(this.editor, "linkMenuAll", "[[", "all", {
				allowSpaces: true,
				allowedPrefixes: null,
			}),
			linkMenu(this.editor, "linkMenuResource", "@", "resource", {
				// Names have spaces ("@Mara Okafor"); the popup stays quiet when
				// what follows is not one.
				allowSpaces: true,
				allowedPrefixes: [" "],
			}),
			tidyPunctuation(),
		];
	},
});

/**
 * A link is followed by a space so typing can go on. If the next thing typed
 * is punctuation, that space goes: "Mara." not "Mara .".
 */
function tidyPunctuation() {
	return new Plugin({
		key: new PluginKey("linkPunctuation"),
		props: {
			handleTextInput(view, from, to, text) {
				if (!/^[.,;:!?)\]]$/.test(text) || from !== to) return false;
				const { doc } = view.state;
				const before = doc.textBetween(Math.max(0, from - 1), from, "\n", "\n");
				const node = doc.resolve(from).nodeBefore;
				if (before !== " " || !node || node.type.name !== "text") return false;
				const resolved = doc.resolve(from - 1);
				if (resolved.nodeBefore?.type.name !== LINK_NODE) return false;
				view.dispatch(view.state.tr.insertText(text, from - 1, from));
				return true;
			},
		},
	});
}
