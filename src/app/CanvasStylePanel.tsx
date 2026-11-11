import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { Block } from "../core/note-format";
import {
	blockTone,
	ITEM_TONES,
	type ItemTone,
	toneAttr,
} from "../core/notes/canvas-ops";
import {
	blockShape,
	blockTextSize,
	hasTextSize,
	SHAPE_KINDS,
	type ShapeKind,
	TEXT_SIZES,
	type TextSize,
} from "../core/notes/canvas-style";

const TONE_LABELS: { [tone in ItemTone]: string } = {
	note: "Note",
	info: "Info",
	tip: "Tip",
	warning: "Warning",
	danger: "Danger",
};

const SHAPE_LABELS: { [kind in ShapeKind]: string } = {
	rectangle: "Rectangle",
	rounded: "Rounded box",
	ellipse: "Ellipse",
	diamond: "Diamond",
};

const SIZE_LABELS: { [size in TextSize]: string } = {
	s: "Small",
	m: "Medium",
	l: "Large",
};

/** The one value every item shares, or null when they differ. */
function shared<T>(values: T[]): T | null {
	const [first] = values;
	return first !== undefined && values.every((value) => value === first)
		? first
		: null;
}

/**
 * A panel for what a selection looks like: color (cards, sticky notes,
 * shapes), outline (shapes) and text size (sticky notes, shapes, labels). It
 * stays open so several choices can be made in a row, and each section shows
 * the current value when the whole selection agrees. Sections that do not
 * apply to anything selected are not shown.
 */
export function CanvasStylePanel({
	picked,
	onTone,
	onShape,
	onTextSize,
}: {
	picked: Block[];
	onTone?: (ids: string[], tone: ItemTone) => void;
	onShape?: (ids: string[], kind: ShapeKind) => void;
	onTextSize?: (ids: string[], size: TextSize) => void;
}) {
	const toned = onTone ? picked.filter((b) => toneAttr(b) !== null) : [];
	const shapes = onShape ? picked.filter((b) => b.type === "shape") : [];
	const sized = onTextSize ? picked.filter(hasTextSize) : [];
	if (toned.length + shapes.length + sized.length === 0) return null;
	const idsOf = (blocks: Block[]) => blocks.map((b) => b.id as string);
	const currentTone = shared(toned.map(blockTone));
	const currentShape = shared(shapes.map(blockShape));
	const currentSize = shared(sized.map(blockTextSize));
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button size="sm" variant="ghost" title="Change how it looks">
					<Palette aria-hidden="true" /> Style
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="canvas-style-panel"
				aria-label="Style"
			>
				{toned.length > 0 && onTone && (
					<fieldset className="canvas-style-section">
						<legend>Color</legend>
						<div className="canvas-style-options">
							{ITEM_TONES.map((tone) => (
								<Button
									key={tone}
									size="sm"
									variant="ghost"
									aria-pressed={currentTone === tone}
									onClick={() => onTone(idsOf(toned), tone)}
								>
									<span
										className="tone-swatch"
										data-tone={tone}
										aria-hidden="true"
									/>
									{TONE_LABELS[tone]}
								</Button>
							))}
						</div>
					</fieldset>
				)}
				{shapes.length > 0 && onShape && (
					<fieldset className="canvas-style-section">
						<legend>Shape</legend>
						<div className="canvas-style-options">
							{SHAPE_KINDS.map((kind) => (
								<Button
									key={kind}
									size="sm"
									variant="ghost"
									aria-pressed={currentShape === kind}
									onClick={() => onShape(idsOf(shapes), kind)}
								>
									{SHAPE_LABELS[kind]}
								</Button>
							))}
						</div>
					</fieldset>
				)}
				{sized.length > 0 && onTextSize && (
					<fieldset className="canvas-style-section">
						<legend>Text size</legend>
						<div className="canvas-style-options">
							{TEXT_SIZES.map((size) => (
								<Button
									key={size}
									size="sm"
									variant="ghost"
									aria-pressed={currentSize === size}
									onClick={() => onTextSize(idsOf(sized), size)}
								>
									{SIZE_LABELS[size]}
								</Button>
							))}
						</div>
					</fieldset>
				)}
			</PopoverContent>
		</Popover>
	);
}
