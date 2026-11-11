import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

export interface SegmentOption {
	value: string;
	label: ReactNode;
	/** Spoken name when `label` is not text (for example a digit). */
	ariaLabel?: string;
}

/**
 * A single pick from a few visible choices (Easy / Moderate / Hard). Arrow keys
 * move between choices (one tab stop), Space or Enter picks, and picking the
 * chosen one again, or pressing Backspace or Delete, clears it when
 * `clearable`. `null` means nothing is picked. Colors come from theme tokens.
 */
export function SegmentedInput({
	options,
	value,
	onChange,
	label,
	clearable = true,
	disabled,
	className,
}: {
	options: readonly SegmentOption[];
	value: string | null;
	onChange: (value: string | null) => void;
	/** Names the group for screen readers. */
	label: string;
	clearable?: boolean;
	disabled?: boolean;
	className?: string;
}) {
	const onKeyDown = (e: KeyboardEvent) => {
		if (
			clearable &&
			value !== null &&
			(e.key === "Backspace" || e.key === "Delete")
		) {
			e.preventDefault();
			onChange(null);
		}
	};
	return (
		<ToggleGroup
			type="single"
			aria-label={label}
			value={value ?? ""}
			disabled={disabled}
			className={cn("flex-wrap", className)}
			onKeyDown={onKeyDown}
			onValueChange={(v) => {
				if (v === "") {
					if (clearable) onChange(null);
				} else onChange(v);
			}}
		>
			{options.map((o) => (
				<ToggleGroupItem key={o.value} value={o.value} aria-label={o.ariaLabel}>
					{o.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

/** A 1 to 5 scale (mood, energy). The ends can carry short captions. */
export function ScaleInput({
	value,
	onChange,
	label,
	min = 1,
	max = 5,
	lowLabel,
	highLabel,
	clearable = true,
	disabled,
}: {
	value: number | null;
	onChange: (value: number | null) => void;
	label: string;
	min?: number;
	max?: number;
	lowLabel?: string;
	highLabel?: string;
	clearable?: boolean;
	disabled?: boolean;
}) {
	const options: SegmentOption[] = [];
	for (let n = min; n <= max; n++) {
		const caption =
			n === min && lowLabel
				? `, ${lowLabel}`
				: n === max && highLabel
					? `, ${highLabel}`
					: "";
		options.push({
			value: String(n),
			label: String(n),
			ariaLabel: `${n}${caption}`,
		});
	}
	return (
		<div className="inline-flex flex-col gap-1">
			<SegmentedInput
				options={options}
				value={value === null ? null : String(value)}
				onChange={(v) => onChange(v === null ? null : Number(v))}
				label={label}
				clearable={clearable}
				disabled={disabled}
			/>
			{(lowLabel || highLabel) && (
				<div
					className="flex justify-between text-xs text-muted-foreground"
					aria-hidden
				>
					<span>{lowLabel}</span>
					<span>{highLabel}</span>
				</div>
			)}
		</div>
	);
}
