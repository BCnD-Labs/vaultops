import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
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
	editorFonts,
	type FontChoice,
	headingFonts,
	loadFontChoice,
	saveFontChoice,
} from "../ui/fonts";
import {
	loadThemeChoice,
	saveThemeChoice,
	type ThemeChoice,
	themes,
} from "../ui/themes";
import { usePlanner } from "./planner/PlannerContext";
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
	modal = false,
}: {
	host: UpdateHost;
	updatePollMs?: number;
	/** Shown inside a dialog: the heading is the dialog's title. */
	modal?: boolean;
}) {
	const root = document.documentElement;
	const planner = usePlanner();
	const [choice, setChoice] = useState<ThemeChoice>(loadThemeChoice);
	const [fonts, setFonts] = useState<FontChoice>(loadFontChoice);
	const [colors, setColors] = useState(loadColors);
	const mode = resolveMode(choice.mode, systemIsDark());
	const picked = colors[mode];

	const change = (next: ThemeChoice) => {
		setChoice(next);
		saveThemeChoice(next);
		refreshAppearance(root);
	};
	const changeFonts = (next: FontChoice) => {
		setFonts(next);
		saveFontChoice(next);
		refreshAppearance(root);
	};
	const changeColors = (next: typeof colors) => {
		setColors(next);
		saveColors(next);
		refreshAppearance(root);
	};

	const appearanceSection = (
		<>
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
					className="settings-theme-group"
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
		</>
	);
	const fontsSection = (
		<>
			<h3 className="section-label">Fonts</h3>
			<div className="settings-row">
				<span id="settings-editor-font">Editor font</span>
				<ToggleGroup
					className="settings-theme-group"
					type="single"
					aria-labelledby="settings-editor-font"
					value={fonts.editor}
					onValueChange={(value) => {
						const next = editorFonts.find(([id]) => id === value);
						if (next) changeFonts({ ...fonts, editor: next[0] });
					}}
				>
					{editorFonts.map(([id, label]) => (
						<ToggleGroupItem key={id} value={id}>
							{label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
			<div className="settings-row">
				<span id="settings-heading-font">Titles, tags and headings</span>
				<ToggleGroup
					className="settings-theme-group"
					type="single"
					aria-labelledby="settings-heading-font"
					value={fonts.heading}
					onValueChange={(value) => {
						const next = headingFonts.find(([id]) => id === value);
						if (next) changeFonts({ ...fonts, heading: next[0] });
					}}
				>
					{headingFonts.map(([id, label]) => (
						<ToggleGroupItem key={id} value={id}>
							{label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
		</>
	);
	const interfaceSection = (
		<>
			<h3 className="section-label">Interface</h3>
			<div className="settings-row">
				<span id="settings-calendar">Calendar</span>
				<ToggleGroup
					type="single"
					aria-labelledby="settings-calendar"
					value={planner.calendarInTitleBar ? "titlebar" : "sidebar"}
					onValueChange={(value) => {
						// Exactly one place at a time; a click on the chosen one does nothing.
						if (value) planner.setCalendarInTitleBar(value === "titlebar");
					}}
				>
					<ToggleGroupItem value="titlebar">Title bar</ToggleGroupItem>
					<ToggleGroupItem value="sidebar">Sidebar</ToggleGroupItem>
				</ToggleGroup>
			</div>
		</>
	);
	const updatesSection = (
		<>
			<UpdateSection host={host} pollMs={updatePollMs} />
		</>
	);

	const sections = [
		["appearance", "Appearance", appearanceSection],
		["fonts", "Fonts", fontsSection],
		["interface", "Interface", interfaceSection],
		["updates", "Updates", updatesSection],
	] as const;
	const [active, setActive] =
		useState<(typeof sections)[number][0]>("appearance");

	if (modal) {
		const current = sections.find(([id]) => id === active) ?? sections[0];
		return (
			<section className="settings-window">
				<header className="settings-titlebar">
					<DialogClose className="settings-close" aria-label="Close">
						<X aria-hidden="true" />
					</DialogClose>
					<DialogTitle className="settings-window-title">Settings</DialogTitle>
					<DialogDescription className="sr-only">
						Appearance, fonts, interface and update options.
					</DialogDescription>
				</header>
				<div className="settings-body">
					<nav className="settings-nav" aria-label="Settings sections">
						{sections.map(([id, label]) => (
							<button
								key={id}
								type="button"
								className="settings-nav-item"
								aria-current={id === active ? "page" : undefined}
								onClick={() => setActive(id)}
							>
								{label}
							</button>
						))}
					</nav>
					<div className="settings-content">
						<h3 className="settings-content-title">{current[1]}</h3>
						{current[2]}
					</div>
				</div>
			</section>
		);
	}

	return (
		<section className="vault-screen settings-screen">
			<h2>Settings</h2>
			{appearanceSection}
			{fontsSection}
			{interfaceSection}
			{updatesSection}
		</section>
	);
}

/**
 * Settings as a window over the workspace: the panes, tabs and notes behind it
 * stay exactly as they were, and closing it (Esc, the X, or a click outside)
 * puts you right back.
 */
export function SettingsDialog({
	open,
	onOpenChange,
	host,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	host: UpdateHost;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="settings-dialog" showClose={false}>
				<SettingsScreen host={host} modal />
			</DialogContent>
		</Dialog>
	);
}
