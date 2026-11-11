import { Minus, Plus, RotateCcw } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	TEXT_SIZE_MAX,
	TEXT_SIZE_MIN,
	TEXT_SIZES,
	type TextSizeId,
	textSizeKey,
} from "../ui/appearance";
import { settings } from "./settings";

const clampSize = (px: number) =>
	Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, Math.round(px)));

/** The size is saved as the setting; the settings window applies it to the page. */
const sizeOf = (id: TextSizeId) => settings.get(textSizeKey(id));
const setSize = (id: TextSizeId, px: number) =>
	settings.set(textSizeKey(id), px);

function SizeRow({ id, label }: { id: TextSizeId; label: string }) {
	const picked = sizeOf(id);
	const sample = useRef<HTMLDivElement>(null);
	// What the theme gives this level, in pixels, read from the rendered sample.
	const [shown, setShown] = useState<number | null>(null);
	const [draft, setDraft] = useState<string | null>(null);

	useLayoutEffect(() => {
		const px = Number.parseFloat(
			sample.current ? getComputedStyle(sample.current).fontSize : "",
		);
		const next = Number.isFinite(px) ? Math.round(px) : null;
		if (next !== shown) setShown(next);
	});

	const current = picked > 0 ? picked : shown;
	const step = (delta: number) =>
		setSize(id, clampSize((current ?? 16) + delta));
	const commit = () => {
		const typed = Number(draft);
		setDraft(null);
		if (draft?.trim() && Number.isFinite(typed)) setSize(id, clampSize(typed));
	};
	const inputId = `text-size-${id}`;

	return (
		<div className="settings-row text-size-row" data-setting={textSizeKey(id)}>
			<div className="settings-row-text">
				<label htmlFor={inputId}>{label}</label>
				<div className="text-size-preview">
					<div className="text-size-sample" data-size={id} ref={sample}>
						The quick brown fox jumps over the lazy dog
					</div>
				</div>
			</div>
			<div className="text-size-controls">
				<Button
					variant="secondary"
					size="icon"
					aria-label={`Smaller ${label.toLowerCase()}`}
					disabled={current !== null && current <= TEXT_SIZE_MIN}
					onClick={() => step(-1)}
				>
					<Minus aria-hidden="true" />
				</Button>
				<Input
					id={inputId}
					type="number"
					className="text-size-input"
					min={TEXT_SIZE_MIN}
					max={TEXT_SIZE_MAX}
					value={draft ?? current ?? ""}
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commit}
					onKeyDown={(event) => {
						if (event.key === "Enter") commit();
						if (event.key === "Escape") setDraft(null);
					}}
				/>
				<span aria-hidden="true">px</span>
				<Button
					variant="secondary"
					size="icon"
					aria-label={`Larger ${label.toLowerCase()}`}
					disabled={current !== null && current >= TEXT_SIZE_MAX}
					onClick={() => step(1)}
				>
					<Plus aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Reset ${label.toLowerCase()}`}
					title="Back to the theme's size"
					disabled={picked === 0}
					onClick={() => settings.reset(textSizeKey(id))}
				>
					<RotateCcw aria-hidden="true" />
				</Button>
			</div>
		</div>
	);
}

/**
 * Editor > Text size: one row per level (body and H1 to H6) with a pixel
 * stepper, a reset and a sample line at that size. A change is saved and
 * applied at once, with no apply button.
 */
export function TextSizeSettings() {
	const allDefault = TEXT_SIZES.every(({ id }) => sizeOf(id) === 0);
	return (
		<>
			<h3 className="section-label">Text size</h3>
			<p className="settings-note">
				Sizes in pixels for body text and each heading level. Until you change
				one it follows the theme.
			</p>
			{TEXT_SIZES.map(({ id, label }) => (
				<SizeRow key={id} id={id} label={label} />
			))}
			<div className="settings-actions">
				<Button
					variant="secondary"
					disabled={allDefault}
					onClick={() => {
						for (const { id } of TEXT_SIZES) settings.reset(textSizeKey(id));
					}}
				>
					Reset all
				</Button>
			</div>
		</>
	);
}
