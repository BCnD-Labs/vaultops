import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	colorKeys,
	colorLabels,
	colorTokens,
	currentColor,
	loadColors,
	refreshAppearance,
	resolveMode,
	saveColors,
	systemIsDark,
} from "../ui/appearance";
import {
	loadThemeChoice,
	saveThemeChoice,
	type ThemeChoice,
	themes,
} from "../ui/themes";
import { type UpdateHost, UpdateSection } from "./UpdateSection";

const modes = [
	["light", "Light"],
	["dark", "Dark"],
	["system", "System"],
] as const;

/**
 * Settings: appearance, then the stopgap Updates section. Mode and theme apply
 * the moment they change; the color pickers replace single theme colors for the
 * current mode (light or dark) and "Reset" puts that mode back to the theme.
 */
export function SettingsScreen({
	host,
	updatePollMs,
}: {
	host: UpdateHost;
	updatePollMs?: number;
}) {
	const root = document.documentElement;
	const [choice, setChoice] = useState<ThemeChoice>(loadThemeChoice);
	const [colors, setColors] = useState(loadColors);
	const mode = resolveMode(choice.mode, systemIsDark());
	const picked = colors[mode];

	const change = (next: ThemeChoice) => {
		setChoice(next);
		saveThemeChoice(next);
		refreshAppearance(root);
	};
	const changeColors = (next: typeof colors) => {
		setColors(next);
		saveColors(next);
		refreshAppearance(root);
	};

	return (
		<section className="vault-screen settings-screen">
			<h2>Settings</h2>
			<h3 className="section-label">Appearance</h3>
			<div className="settings-row">
				<span id="settings-mode">Mode</span>
				<ToggleGroup
					type="single"
					aria-labelledby="settings-mode"
					value={choice.mode}
					onValueChange={(value) => {
						const next = modes.find(([id]) => id === value);
						if (next) change({ ...choice, mode: next[0] });
					}}
				>
					{modes.map(([id, label]) => (
						<ToggleGroupItem key={id} value={id}>
							{label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
			<div className="settings-row">
				<span id="settings-theme">Theme</span>
				<ToggleGroup
					type="single"
					aria-labelledby="settings-theme"
					value={choice.id}
					onValueChange={(value) => {
						if (themes.some((theme) => theme.id === value))
							change({ ...choice, id: value });
					}}
				>
					{themes.map((theme) => (
						<ToggleGroupItem key={theme.id} value={theme.id}>
							{theme.name}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
			<h3 className="section-label">Colors for {mode} mode</h3>
			{colorKeys.map((key) => (
				<div className="settings-row" key={key}>
					<label htmlFor={`color-${key}`}>{colorLabels[key]}</label>
					<input
						id={`color-${key}`}
						type="color"
						value={picked[key] ?? currentColor(colorTokens[key][0] ?? "", root)}
						onChange={(event) =>
							changeColors({
								...colors,
								[mode]: { ...picked, [key]: event.target.value },
							})
						}
					/>
				</div>
			))}
			<p className="settings-note">
				Colors are saved separately for light and dark mode. Highlight and
				callout colors arrive with those blocks.
			</p>
			<Button
				variant="secondary"
				disabled={Object.keys(picked).length === 0}
				onClick={() => changeColors({ ...colors, [mode]: {} })}
			>
				Reset {mode} colors
			</Button>
			<UpdateSection host={host} pollMs={updatePollMs} />
		</section>
	);
}
