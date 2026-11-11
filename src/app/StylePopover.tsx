import { Folder, type LucideIcon, Palette } from "lucide-react";
import { type ReactElement, useState } from "react";
import { ColorPicker, type PaletteSwatch } from "@/components/ui/color-picker";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
	buildStyle,
	colourCss,
	DEFAULT_BACKGROUND_ALPHA,
	type ItemStyle,
	normalizeColour,
	partsOf,
	rowPaint,
	STYLE_PART_LABELS,
	STYLE_PARTS,
	type StylePart,
	type StyleParts,
	TONES,
	type Tone,
} from "./appearance";
import { IconPicker } from "./IconPicker";
import { canonicalIconName, resolveIcon } from "./iconCatalog";

/** Swatches for one colour choice; `null` clears it. */
export function Swatches({
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

/** Right-click menu on a tag row for choosing its colour. */
export function TagColourPicker({
	tone,
	onChange,
	children,
}: {
	tone: Tone | undefined;
	onChange: (tone: Tone | null) => void;
	children: ReactElement;
}) {
	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent className="style-popover">
				<p className="style-heading">Tag colour</p>
				<Swatches value={tone} onPick={onChange} />
			</ContextMenuContent>
		</ContextMenu>
	);
}

const PALETTE: readonly PaletteSwatch[] = TONES.map((tone) => ({
	value: tone,
	label: `Colour ${tone}`,
	css: `var(--tone-${tone})`,
}));

/** The row as it will look in the sidebar, repainted live. */
function Preview({
	name,
	Icon,
	style,
}: {
	name: string;
	Icon: LucideIcon;
	style: ItemStyle | null;
}) {
	const paint = rowPaint(style ?? undefined);
	return (
		<div
			className="tree-row style-preview"
			style={paint.style}
			{...paint.attrs}
		>
			<Icon className="tree-icon tree-icon-main" aria-hidden="true" />
			<span className="tree-name">{name}</span>
		</div>
	);
}

/** Icon and per-part colour editor for a folder or note row. */
export function StylePopover({
	name,
	style,
	onChange,
	defaultIcon = Folder,
	open: shown,
	onOpenChange,
	children,
}: {
	name: string;
	style: ItemStyle | undefined;
	onChange: (next: ItemStyle | null) => void;
	/** Icon shown when none is chosen. */
	defaultIcon?: LucideIcon;
	/** Opened from elsewhere (a menu): the popover is anchored to `children`, with no button of its own. */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: ReactElement;
}) {
	const [view, setView] = useState<"main" | "icon">("main");
	const [open, setOpen] = useState<StylePart | null>(null);
	// Colours of parts switched off, so switching back on restores them.
	const [remembered, setRemembered] = useState<StyleParts>({});
	const parts: StyleParts = partsOf(style);
	const iconName = style?.icon ? canonicalIconName(style.icon) : null;
	const Icon =
		(style?.icon ? resolveIcon(style.icon) : undefined) ?? defaultIcon;

	const save = (icon: string | undefined, next: StyleParts) =>
		onChange(buildStyle(icon, next));
	const setPart = (part: StylePart, value: StyleParts[StylePart]) => {
		const next = { ...parts };
		if (value) next[part] = value;
		else delete next[part];
		save(style?.icon, next);
	};
	const toggle = (part: StylePart, on: boolean) => {
		if (on) {
			setPart(part, remembered[part] ?? { color: "blue" });
		} else {
			if (parts[part]) setRemembered({ ...remembered, [part]: parts[part] });
			setPart(part, undefined);
			if (open === part) setOpen(null);
		}
	};
	const recolour = (part: StylePart, colour: string | undefined) => {
		const c = colour === undefined ? null : normalizeColour(colour);
		if (!c) {
			toggle(part, false);
			return;
		}
		setPart(part, { ...parts[part], color: c });
	};

	return (
		<Popover
			{...(shown === undefined ? {} : { open: shown })}
			onOpenChange={(o) => {
				if (!o) {
					setView("main");
					setOpen(null);
				}
				onOpenChange?.(o);
			}}
		>
			{children ? (
				<PopoverAnchor asChild>{children}</PopoverAnchor>
			) : (
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
			)}
			<PopoverContent className="style-popover" align="start">
				<Preview name={name} Icon={Icon} style={style ?? null} />
				{view === "icon" ? (
					<>
						<div className="style-icon-head">
							<p className="style-heading">Choose an icon</p>
							<button
								type="button"
								className="style-link"
								onClick={() => setView("main")}
							>
								Back
							</button>
						</div>
						<IconPicker
							selected={iconName ?? undefined}
							onPick={(n) => {
								save(n, parts);
								setView("main");
							}}
						/>
						{style?.icon && (
							<button
								type="button"
								className="style-link"
								onClick={() => {
									save(undefined, parts);
									setView("main");
								}}
							>
								Use the default icon
							</button>
						)}
					</>
				) : (
					<>
						<p className="style-heading">Icon</p>
						<div className="style-icon-row">
							<Icon className="tree-icon" aria-hidden="true" />
							<span className="style-icon-name">{iconName ?? "Default"}</span>
							<button
								type="button"
								className="style-mode"
								onClick={() => setView("icon")}
							>
								Change
							</button>
						</div>
						<p className="style-heading">Colours</p>
						<ul className="style-parts">
							{STYLE_PARTS.map((part) => {
								const p = parts[part];
								return (
									<li key={part} className="style-part">
										<div className="style-part-row">
											<Switch
												checked={!!p}
												onCheckedChange={(on) => toggle(part, on)}
												aria-label={`${STYLE_PART_LABELS[part]} colour on`}
											/>
											<span className="style-part-label">
												{STYLE_PART_LABELS[part]}
											</span>
											<button
												type="button"
												className="style-swatch"
												style={{
													background: p ? colourCss(p.color) : "transparent",
												}}
												aria-label={`${STYLE_PART_LABELS[part]} colour`}
												aria-expanded={open === part}
												title="Choose colour"
												onClick={() => setOpen(open === part ? null : part)}
											/>
										</div>
										{open === part && (
											<div className="style-part-editor">
												<ColorPicker
													value={p?.color}
													palette={PALETTE}
													onChange={(c) => recolour(part, c)}
												/>
												{part === "background" && p && (
													<label className="style-opacity">
														<span>Strength</span>
														<input
															type="range"
															min={2}
															max={60}
															step={1}
															aria-label="Background strength"
															value={Math.round(
																(p.alpha ?? DEFAULT_BACKGROUND_ALPHA) * 100,
															)}
															onChange={(e) =>
																setPart("background", {
																	...p,
																	alpha: Number(e.target.value) / 100,
																})
															}
														/>
													</label>
												)}
											</div>
										)}
									</li>
								);
							})}
						</ul>
					</>
				)}
				{style && view === "main" && (
					<button
						type="button"
						className="style-reset"
						onClick={() => {
							setRemembered({});
							onChange(null);
						}}
					>
						Reset to default
					</button>
				)}
			</PopoverContent>
		</Popover>
	);
}
