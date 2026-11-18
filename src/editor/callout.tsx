import { mergeAttributes, Node } from "@tiptap/core";
import {
	NodeViewContent,
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import {
	Info,
	Lightbulb,
	OctagonAlert,
	StickyNote,
	TriangleAlert,
} from "lucide-react";
import { type CSSProperties, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { isTone, normalizeColour, type StyleColour } from "../app/appearance";
import { IconPicker } from "../app/IconPicker";
import { canonicalIconName, resolveIcon } from "../app/iconCatalog";
import { Swatches } from "../app/StylePopover";

export const CALLOUT_TONES = [
	"note",
	"info",
	"tip",
	"warning",
	"danger",
] as const;
export type CalloutTone = (typeof CALLOUT_TONES)[number];

export const CALLOUT_ICONS = {
	note: StickyNote,
	info: Info,
	tip: Lightbulb,
	warning: TriangleAlert,
	danger: OctagonAlert,
} as const;

export const CALLOUT_TONE_LABELS: Readonly<Record<CalloutTone, string>> = {
	note: "Note",
	info: "Info",
	tip: "Tip",
	warning: "Warning",
	danger: "Danger",
};

export function toneOf(value: unknown): CalloutTone {
	return CALLOUT_TONES.find((tone) => tone === value) ?? "note";
}

export function calloutIconOf(value: unknown): string | null {
	return typeof value === "string" ? canonicalIconName(value) : null;
}

export function calloutColorOf(value: unknown): StyleColour | null {
	return normalizeColour(value);
}

function CalloutView({ node, editor, updateAttributes }: NodeViewProps) {
	const [open, setOpen] = useState(false);
	const tone = toneOf(node.attrs.tone);
	const iconName = calloutIconOf(node.attrs.icon);
	const color = calloutColorOf(node.attrs.color);
	const Icon =
		(iconName ? resolveIcon(iconName) : undefined) ?? CALLOUT_ICONS[tone];
	const customStyle =
		color && !isTone(color)
			? ({ "--tone": color } as CSSProperties)
			: undefined;

	return (
		<NodeViewWrapper
			className="callout"
			data-tone={tone}
			data-icon={iconName ?? undefined}
			data-color={color ?? undefined}
			style={customStyle}
		>
			<Popover open={editor.isEditable && open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="callout-icon"
						contentEditable={false}
						disabled={!editor.isEditable}
						aria-label={`Callout style (${tone})`}
						title={`Callout style (${tone})`}
					>
						<Icon aria-hidden="true" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					className="style-popover callout-style-popover"
					align="start"
					contentEditable={false}
				>
					<p className="style-heading">Preset</p>
					<div className="callout-presets">
						{CALLOUT_TONES.map((preset) => {
							const PresetIcon = CALLOUT_ICONS[preset];
							const active = tone === preset && !iconName && !color;
							return (
								<Button
									key={preset}
									type="button"
									variant="outline"
									size="sm"
									aria-label={`Callout preset ${preset}`}
									aria-pressed={active}
									onClick={() =>
										updateAttributes({
											tone: preset,
											icon: null,
											color: null,
										})
									}
								>
									<PresetIcon className="tree-icon" aria-hidden="true" />
									<span>{CALLOUT_TONE_LABELS[preset]}</span>
								</Button>
							);
						})}
					</div>
					<p className="style-heading">Colour</p>
					<Swatches
						value={color && isTone(color) ? color : undefined}
						onPick={(next) => updateAttributes({ color: next })}
					/>
					<div className="style-icon-head">
						<p className="style-heading">Icon</p>
						{iconName && (
							<Button
								type="button"
								variant="link"
								size="sm"
								onClick={() => updateAttributes({ icon: null })}
							>
								Default icon
							</Button>
						)}
					</div>
					<IconPicker
						selected={iconName ?? undefined}
						onPick={(next) => updateAttributes({ icon: next })}
					/>
				</PopoverContent>
			</Popover>
			<NodeViewContent className="callout-body" />
		</NodeViewWrapper>
	);
}

/**
 * A tinted box around one or more paragraphs: the first paragraph is the title
 * row (icon + bold coloured text) and any following paragraphs are the body.
 * Stored as a container: a `callout` line with optional `attrs.tone`,
 * `attrs.icon` and `attrs.color` (all left out at their defaults) and its
 * paragraphs as child lines.
 */
export const Callout = Node.create({
	name: "callout",
	group: "block",
	content: "paragraph+",
	defining: true,
	// Runs before the core Enter and Backspace handling.
	priority: 1000,

	addAttributes() {
		return {
			tone: {
				default: "note",
				parseHTML: (element) => toneOf(element.getAttribute("data-tone")),
				renderHTML: (attributes) => ({ "data-tone": toneOf(attributes.tone) }),
			},
			icon: {
				default: null,
				parseHTML: (element) =>
					calloutIconOf(element.getAttribute("data-icon")),
				renderHTML: (attributes) => {
					const icon = calloutIconOf(attributes.icon);
					return icon ? { "data-icon": icon } : {};
				},
			},
			color: {
				default: null,
				parseHTML: (element) =>
					calloutColorOf(element.getAttribute("data-color")),
				renderHTML: (attributes) => {
					const color = calloutColorOf(attributes.color);
					return color ? { "data-color": color } : {};
				},
			},
		};
	},

	parseHTML() {
		return [{ tag: 'div[data-type="callout"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "callout" }),
			0,
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(CalloutView);
	},

	addKeyboardShortcuts() {
		return {
			Backspace: () => {
				const { $from, empty } = this.editor.state.selection;
				if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false;
				if ($from.node(-1).type.name !== this.name || $from.index(-1) !== 0)
					return false;
				return this.editor.commands.lift(this.name);
			},
		};
	},
});
