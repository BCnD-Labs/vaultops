import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
	Bold,
	Code,
	Highlighter,
	Italic,
	type LucideIcon,
	Strikethrough,
	Subscript,
	Superscript,
	Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface FormatMark {
	/** The mark's name in the note file. */
	name: string;
	label: string;
	shortcut: string;
	icon: LucideIcon;
	toggle: (editor: Editor) => void;
}

export const FORMAT_MARKS: FormatMark[] = [
	{
		name: "bold",
		label: "Bold",
		shortcut: "Mod+B",
		icon: Bold,
		toggle: (editor) => editor.chain().focus().toggleBold().run(),
	},
	{
		name: "italic",
		label: "Italic",
		shortcut: "Mod+I",
		icon: Italic,
		toggle: (editor) => editor.chain().focus().toggleItalic().run(),
	},
	{
		name: "underline",
		label: "Underline",
		shortcut: "Mod+U",
		icon: Underline,
		toggle: (editor) => editor.chain().focus().toggleUnderline().run(),
	},
	{
		name: "strike",
		label: "Strikethrough",
		shortcut: "Mod+Shift+S",
		icon: Strikethrough,
		toggle: (editor) => editor.chain().focus().toggleStrike().run(),
	},
	{
		name: "highlight",
		label: "Highlight",
		shortcut: "Mod+Shift+H",
		icon: Highlighter,
		toggle: (editor) => editor.chain().focus().toggleHighlight().run(),
	},
	{
		name: "code",
		label: "Code",
		shortcut: "Mod+E",
		icon: Code,
		toggle: (editor) => editor.chain().focus().toggleCode().run(),
	},
	{
		name: "subscript",
		label: "Subscript",
		shortcut: "Mod+,",
		icon: Subscript,
		toggle: (editor) => editor.chain().focus().toggleSubscript().run(),
	},
	{
		name: "superscript",
		label: "Superscript",
		shortcut: "Mod+.",
		icon: Superscript,
		toggle: (editor) => editor.chain().focus().toggleSuperscript().run(),
	},
];

/** The text-formatting buttons shown over a selection. */
export function FormatBar({ editor }: { editor: Editor }) {
	const active = useEditorState({
		editor,
		selector: ({ editor: current }) =>
			Object.fromEntries(
				FORMAT_MARKS.map((mark) => [mark.name, current.isActive(mark.name)]),
			),
	});
	return (
		<div className="format-bar" role="toolbar" aria-label="Text formatting">
			{FORMAT_MARKS.map((mark) => (
				<Tooltip key={mark.name}>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label={mark.label}
							aria-pressed={active[mark.name] === true}
							// Keep the selection: a click would move focus out of the editor.
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => mark.toggle(editor)}
						>
							<mark.icon aria-hidden="true" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{mark.label} ({mark.shortcut})
					</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}
