import { Palette } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	ICONS,
	type ItemStyle,
	modeOf,
	STYLE_MODE_LABELS,
	STYLE_MODES,
	TONES,
	type Tone,
} from "./appearance";

/** Swatches for one colour choice; `null` clears it. */
function Swatches({
	value,
	onPick,
}: {
	value: Tone | undefined;
	onPick: (tone: Tone | null) => void;
}) {
	return (
		<div className="style-swatches">
			<button
				type="button"
				className="style-swatch style-swatch-none"
				aria-label="No colour"
				aria-pressed={value === undefined}
				title="No colour"
				onClick={() => onPick(null)}
			/>
			{TONES.map((tone) => (
				<button
					key={tone}
					type="button"
					className="style-swatch"
					data-tone={tone}
					aria-label={`Colour ${tone}`}
					aria-pressed={value === tone}
					title={tone}
					onClick={() => onPick(tone)}
				/>
			))}
		</div>
	);
}

/** A small button that opens the picker for a tag's colour. */
export function TagColourPicker({
	name,
	tone,
	onChange,
}: {
	name: string;
	tone: Tone | undefined;
	onChange: (tone: Tone | null) => void;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="tree-action"
					aria-label={`Colour for tag ${name}`}
					title="Change colour"
				>
					<Palette className="tree-icon" aria-hidden="true" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="style-popover" align="end">
				<p className="style-heading">Tag colour</p>
				<Swatches value={tone} onPick={onChange} />
			</PopoverContent>
		</Popover>
	);
}

/** Icon, colour and where-to-paint picker for a folder or note row. */
export function StylePopover({
	name,
	style,
	onChange,
}: {
	name: string;
	style: ItemStyle | undefined;
	onChange: (next: ItemStyle | null) => void;
}) {
	const set = (patch: Partial<ItemStyle>) => {
		const next: ItemStyle = { ...style, ...patch };
		if (next.tone === undefined) {
			next.mode = undefined;
		}
		onChange(
			next.icon || next.tone
				? {
						...(next.icon ? { icon: next.icon } : {}),
						...(next.tone ? { tone: next.tone } : {}),
						...(next.tone ? { mode: next.mode ?? "icon-text" } : {}),
					}
				: null,
		);
	};
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="tree-action"
					aria-label={`Style ${name}`}
					title="Icon and colour"
				>
					<Palette className="tree-icon" aria-hidden="true" />
				</button>
			</PopoverTrigger>
			<PopoverContent className="style-popover" align="start">
				<p className="style-heading">Icon</p>
				<div className="style-icons">
					{Object.entries(ICONS).map(([key, Icon]) => (
						<button
							key={key}
							type="button"
							className="style-icon"
							aria-label={`Icon ${key}`}
							aria-pressed={style?.icon === key}
							title={key}
							onClick={() =>
								set({ icon: style?.icon === key ? undefined : key })
							}
						>
							<Icon className="tree-icon" aria-hidden="true" />
						</button>
					))}
				</div>
				<p className="style-heading">Colour</p>
				<Swatches
					value={style?.tone}
					onPick={(tone) => set({ tone: tone ?? undefined })}
				/>
				{style?.tone && (
					<>
						<p className="style-heading">Paint on</p>
						<div className="style-modes">
							{STYLE_MODES.map((mode) => (
								<button
									key={mode}
									type="button"
									className="style-mode"
									aria-pressed={modeOf(style) === mode}
									onClick={() => set({ mode })}
								>
									{STYLE_MODE_LABELS[mode]}
								</button>
							))}
						</div>
					</>
				)}
				{style && (
					<button
						type="button"
						className="style-reset"
						onClick={() => onChange(null)}
					>
						Reset to default
					</button>
				)}
			</PopoverContent>
		</Popover>
	);
}
