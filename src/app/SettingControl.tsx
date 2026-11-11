import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SettingDef, SettingValue } from "../core/settings/registry";
import { toHex } from "../ui/appearance";

/** Up to this many choices show as a row of buttons; more become a menu. */
const BUTTON_CHOICES = 9;

/**
 * One settings row, generated from a definition: the label and description on
 * the left, the control for the definition's type on the right.
 * `colorFallback` is what a color picker shows while the theme's own color is used.
 */
export function SettingControl({
	def,
	value,
	onChange,
	colorFallback,
	labelSuffix,
}: {
	def: SettingDef;
	value: SettingValue;
	onChange: (value: SettingValue) => void;
	colorFallback?: string;
	/** Added to the label, for example the mode when search lists both modes. */
	labelSuffix?: string;
}) {
	const id = `setting-${def.key}`;
	const label = labelSuffix ? `${def.label} (${labelSuffix})` : def.label;
	const options = def.options ?? [];
	let control: React.ReactNode;
	switch (def.type) {
		case "toggle":
			control = (
				<Switch
					aria-labelledby={`${id}-label`}
					checked={value === true}
					onCheckedChange={(on) => onChange(on)}
				/>
			);
			break;
		case "select":
		case "font":
			control =
				options.length <= BUTTON_CHOICES ? (
					<ToggleGroup
						className="settings-theme-group"
						type="single"
						aria-labelledby={`${id}-label`}
						value={String(value)}
						onValueChange={(next) => {
							// A click on the chosen one does nothing; there is always one chosen.
							if (next) onChange(next);
						}}
					>
						{options.map((o) => (
							<ToggleGroupItem key={o.value} value={o.value}>
								{o.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				) : (
					<Select value={String(value)} onValueChange={onChange}>
						<SelectTrigger
							aria-labelledby={`${id}-label`}
							className="settings-select"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{options.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				);
			break;
		case "number":
			control = (
				<Input
					id={id}
					type="number"
					className="settings-number"
					min={def.min}
					max={def.max}
					step={def.step}
					value={Number(value)}
					onChange={(event) => {
						const next = event.target.valueAsNumber;
						if (Number.isFinite(next)) onChange(next);
					}}
				/>
			);
			break;
		case "color":
			control = (
				<input
					id={id}
					type="color"
					value={
						value === "" ? (colorFallback ?? toHex(0, 0, 0)) : String(value)
					}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
			break;
		case "text":
		case "shortcut":
			control = def.multiline ? (
				<textarea
					id={id}
					className="settings-code"
					maxLength={def.maxLength}
					spellCheck={false}
					value={String(value)}
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<Input
					id={id}
					className="settings-text"
					maxLength={def.maxLength}
					value={String(value)}
					onChange={(event) => onChange(event.target.value)}
				/>
			);
			break;
	}
	const labelled =
		def.type === "color" ||
		def.type === "number" ||
		def.type === "text" ||
		def.type === "shortcut";
	return (
		<div className="settings-row" data-setting={def.key}>
			<div className="settings-row-text">
				{labelled ? (
					<label id={`${id}-label`} htmlFor={id}>
						{label}
					</label>
				) : (
					<span id={`${id}-label`}>{label}</span>
				)}
				{def.description && <p className="settings-note">{def.description}</p>}
			</div>
			{control}
		</div>
	);
}
