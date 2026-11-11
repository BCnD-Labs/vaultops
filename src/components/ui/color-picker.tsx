import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
	AREA_OVERLAY,
	clamp,
	EXAMPLE_HEX,
	type Hsv,
	HUE_GRADIENT,
	hexToHsv,
	hsvToHex,
	hueColor,
	parseHex,
	pushRecentColor,
	readRecentColors,
} from "./color-utils";

export interface PaletteSwatch {
	/** What `onChange` receives, e.g. a theme tone name or a hex. */
	value: string;
	label: string;
	/** CSS colour used to draw the swatch. */
	css: string;
}

interface ColorPickerProps {
	/** A palette `value` or a `#rrggbb` colour; undefined means the theme default. */
	value: string | undefined;
	onChange: (value: string | undefined) => void;
	palette: readonly PaletteSwatch[];
	/** Colour to start the area from when `value` is not a hex (e.g. a theme tone). */
	fallbackHex?: string;
	/** Label for the "no colour" button. */
	defaultLabel?: string;
	className?: string;
}

const AREA_STEP = 0.02;

/** Saturation/value area, hue slider, hex field, palette, recent colours and a Default button. */
export function ColorPicker({
	value,
	onChange,
	palette,
	fallbackHex = EXAMPLE_HEX,
	defaultLabel = "Default",
	className,
}: ColorPickerProps) {
	const asHex = value ? parseHex(value) : null;
	const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(asHex ?? fallbackHex));
	const [hexText, setHexText] = useState(asHex ?? "");
	const [recent, setRecent] = useState<string[]>(() => readRecentColors());
	const area = useRef<HTMLDivElement>(null);

	const hexNow = hsvToHex(hsv);
	const typed = hexText.trim();
	const hexValid = typed === "" || parseHex(typed) !== null;

	const apply = (next: Hsv, commit: boolean) => {
		setHsv(next);
		const hex = hsvToHex(next);
		setHexText(hex);
		onChange(hex);
		if (commit) setRecent(pushRecentColor(hex));
	};

	const fromPointer = (e: PointerEvent<HTMLDivElement>): Hsv => {
		const rect = e.currentTarget.getBoundingClientRect();
		const w = rect.width || 1;
		const h = rect.height || 1;
		return {
			h: hsv.h,
			s: clamp((e.clientX - rect.left) / w, 0, 1),
			v: clamp(1 - (e.clientY - rect.top) / h, 0, 1),
		};
	};

	const onAreaKey = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = (e.shiftKey ? 5 : 1) * AREA_STEP;
		const next = { ...hsv };
		if (e.key === "ArrowLeft") next.s = clamp(hsv.s - step, 0, 1);
		else if (e.key === "ArrowRight") next.s = clamp(hsv.s + step, 0, 1);
		else if (e.key === "ArrowUp") next.v = clamp(hsv.v + step, 0, 1);
		else if (e.key === "ArrowDown") next.v = clamp(hsv.v - step, 0, 1);
		else return;
		e.preventDefault();
		apply(next, false);
	};

	const onHueKey = (e: KeyboardEvent<HTMLDivElement>) => {
		const step = e.shiftKey ? 15 : 3;
		let h = hsv.h;
		if (e.key === "ArrowLeft" || e.key === "ArrowDown") h -= step;
		else if (e.key === "ArrowRight" || e.key === "ArrowUp") h += step;
		else if (e.key === "Home") h = 0;
		else if (e.key === "End") h = 360;
		else return;
		e.preventDefault();
		apply({ ...hsv, h: clamp(h, 0, 360) }, false);
	};

	const commitHex = () => {
		const hex = parseHex(typed);
		if (!hex) return;
		setHsv(hexToHsv(hex));
		setHexText(hex);
		onChange(hex);
		setRecent(pushRecentColor(hex));
	};

	const pickHex = (hex: string) => {
		setHsv(hexToHsv(hex));
		setHexText(hex);
		onChange(hex);
		setRecent(pushRecentColor(hex));
	};

	return (
		<div className={cn("color-picker", className)}>
			{/* biome-ignore lint/a11y/useSemanticElements: a 2-D picker has no native element */}
			<div
				ref={area}
				className="color-area"
				role="slider"
				tabIndex={0}
				aria-label="Saturation and brightness"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(hsv.s * 100)}
				aria-valuetext={`Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent`}
				style={{
					backgroundColor: hueColor(hsv.h),
					backgroundImage: AREA_OVERLAY,
				}}
				onKeyDown={onAreaKey}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture?.(e.pointerId);
					apply(fromPointer(e), false);
				}}
				onPointerMove={(e) => {
					if (e.buttons) apply(fromPointer(e), false);
				}}
				onPointerUp={(e) => apply(fromPointer(e), true)}
			>
				<span
					className="color-area-thumb"
					style={{
						left: `${hsv.s * 100}%`,
						top: `${(1 - hsv.v) * 100}%`,
						background: hexNow,
					}}
				/>
			</div>
			{/* biome-ignore lint/a11y/useSemanticElements: a custom hue slider */}
			<div
				className="color-hue"
				style={{ backgroundImage: HUE_GRADIENT }}
				role="slider"
				tabIndex={0}
				aria-label="Hue"
				aria-valuemin={0}
				aria-valuemax={360}
				aria-valuenow={Math.round(hsv.h)}
				onKeyDown={onHueKey}
				onPointerDown={(e) => {
					e.currentTarget.setPointerCapture?.(e.pointerId);
					const r = e.currentTarget.getBoundingClientRect();
					apply(
						{
							...hsv,
							h: clamp((e.clientX - r.left) / (r.width || 1), 0, 1) * 360,
						},
						false,
					);
				}}
				onPointerMove={(e) => {
					if (!e.buttons) return;
					const r = e.currentTarget.getBoundingClientRect();
					apply(
						{
							...hsv,
							h: clamp((e.clientX - r.left) / (r.width || 1), 0, 1) * 360,
						},
						false,
					);
				}}
				onPointerUp={() => setRecent(pushRecentColor(hexNow))}
			>
				<span
					className="color-hue-thumb"
					style={{ left: `${(hsv.h / 360) * 100}%` }}
				/>
			</div>
			<div className="color-hex-row">
				<span
					className="color-hex-preview"
					style={{ background: hexNow }}
					aria-hidden="true"
				/>
				<input
					className="color-hex-input"
					aria-label="Hex colour"
					aria-invalid={!hexValid}
					spellCheck={false}
					maxLength={7}
					value={hexText}
					placeholder="hex"
					onChange={(e) => setHexText(e.target.value)}
					onBlur={() => (hexValid ? commitHex() : setHexText(asHex ?? hexNow))}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							if (hexValid) commitHex();
						}
					}}
				/>
				<button
					type="button"
					className="color-default"
					aria-pressed={value === undefined}
					onClick={() => {
						setHexText("");
						onChange(undefined);
					}}
				>
					{defaultLabel}
				</button>
			</div>
			{!hexValid && (
				<p className="color-hex-error" role="alert">
					Use a hex colour like {EXAMPLE_HEX}.
				</p>
			)}
			<fieldset className="color-swatch-group" aria-label="Theme colours">
				{palette.map((s) => (
					<button
						key={s.value}
						type="button"
						className="color-swatch"
						style={{ background: s.css }}
						aria-label={s.label}
						title={s.label}
						aria-pressed={value === s.value}
						onClick={() => {
							const hex = parseHex(s.css);
							if (hex) {
								setHsv(hexToHsv(hex));
								setHexText("");
							}
							onChange(s.value);
						}}
					/>
				))}
			</fieldset>
			{recent.length > 0 && (
				<fieldset className="color-swatch-group" aria-label="Recent colours">
					{recent.map((hex) => (
						<button
							key={hex}
							type="button"
							className="color-swatch"
							style={{ background: hex }}
							aria-label={`Recent ${hex}`}
							title={hex}
							aria-pressed={value === hex}
							onClick={() => pickHex(hex)}
						/>
					))}
				</fieldset>
			)}
		</div>
	);
}
