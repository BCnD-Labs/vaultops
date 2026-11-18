import {
	Brush,
	CalendarDays,
	FolderCog,
	Keyboard,
	LayoutDashboard,
	LayoutTemplate,
	type LucideIcon,
	Monitor,
	Palette,
	PenLine,
	Puzzle,
	Search,
	SlidersHorizontal,
	Wrench,
} from "lucide-react";
import { type ReactNode, useEffect, useReducer, useState } from "react";
import { Button } from "@/components/ui/button";
import { FloatingWindow } from "@/components/ui/floating-editor";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	type ImportReport,
	matchesQuery,
	SECTIONS,
	type SettingDef,
} from "../core/settings/registry";
import { SHORTCUT_COMMANDS } from "../core/settings/shortcuts";
import {
	accentNote,
	type ColorKey,
	colorPreview,
	colorTokens,
	currentColor,
	loadInterface,
	refreshAppearance,
	resolveMode,
	systemIsDark,
} from "../ui/appearance";
import { themes } from "../ui/themes";
import { buildCommit } from "./build-info";
import { SettingControl } from "./SettingControl";
import { ShortcutsList } from "./ShortcutsSection";
import { SETTING_DEFS, settings } from "./settings";
import { TextSizeSettings } from "./TextSizeSettings";
import { type UpdateHost, UpdateSection } from "./UpdateSection";

type Def = SettingDef;
const ALL_DEFS: readonly SettingDef[] = SETTING_DEFS;

/** Sections that show something besides generated settings. */
const CUSTOM_SECTIONS = new Set(["general", "shortcuts", "advanced"]);

/** The icon beside each section in the left list, as in Obsidian's settings. */
const SECTION_ICONS: Record<string, LucideIcon> = {
	general: SlidersHorizontal,
	editor: PenLine,
	appearance: Palette,
	interface: Monitor,
	features: Puzzle,
	themes: Brush,
	canvas: LayoutDashboard,
	planner: CalendarDays,
	templates: LayoutTemplate,
	shortcuts: Keyboard,
	files: FolderCog,
	advanced: Wrench,
};

/** One titled card of settings rows, the way Obsidian groups its settings. */
function Group({ title, children }: { title?: string; children: ReactNode }) {
	return (
		<section className="settings-group">
			{title && <h3 className="settings-group-title">{title}</h3>}
			<div className="settings-card">{children}</div>
		</section>
	);
}

type Mode = "light" | "dark" | "system";
const MODES: readonly { value: Mode; label: string }[] = [
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
	{ value: "system", label: "System" },
];

/** Whether a theme can show a mode; "system" needs both light and dark. */
function themeSupports(id: string, mode: Mode): boolean {
	const modes: readonly string[] = themes.find((t) => t.id === id)?.modes ?? [];
	return mode === "system"
		? modes.includes("light") && modes.includes("dark")
		: modes.includes(mode);
}

/** Three small dots (page, panel, accent) that preview a theme in one mode. */
function ThemeSwatch({ id, mode }: { id: string; mode: "light" | "dark" }) {
	const dots = themes.find((t) => t.id === id)?.swatch[mode] ?? [];
	return (
		<span className="theme-swatch" aria-hidden>
			{dots.map((color, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: three fixed dots
					key={i}
					className="size-3 rounded-full border-[length:var(--border-width)] border-border"
					style={{ backgroundColor: color }}
				/>
			))}
		</span>
	);
}

/**
 * The theme choice as a menu (each theme with a swatch of the mode in view)
 * beside the light / dark / system choice. Modes the theme cannot show are
 * disabled, and picking a theme that lacks the current mode moves to one it has.
 */
function ThemePicker({
	def,
	themeId,
	mode,
	shown,
	onTheme,
	onMode,
}: {
	def: SettingDef;
	themeId: string;
	mode: Mode;
	/** The mode in view once "system" is resolved, for the swatches. */
	shown: "light" | "dark";
	onTheme: (id: string) => void;
	onMode: (mode: Mode) => void;
}) {
	const id = `setting-${def.key}`;
	return (
		<div className="settings-row settings-theme-row" data-setting={def.key}>
			<div className="settings-row-text">
				<span id={`${id}-label`}>{def.label}</span>
				{def.description && <p className="settings-note">{def.description}</p>}
			</div>
			<div className="settings-theme-controls">
				<Select value={themeId} onValueChange={onTheme}>
					<SelectTrigger
						aria-labelledby={`${id}-label`}
						className="settings-select"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{themes.map((theme) => (
							<SelectItem key={theme.id} value={theme.id}>
								<span className="theme-option">
									<ThemeSwatch id={theme.id} mode={shown} />
									{theme.name}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<ToggleGroup
					type="single"
					aria-label="Mode"
					value={mode}
					onValueChange={(next) => {
						// A click on the chosen one does nothing; there is always one chosen.
						if (next) onMode(next as Mode);
					}}
				>
					{MODES.map((m) => (
						<ToggleGroupItem
							key={m.value}
							value={m.value}
							disabled={!themeSupports(themeId, m.value)}
						>
							{m.label}
						</ToggleGroupItem>
					))}
				</ToggleGroup>
			</div>
		</div>
	);
}

/** Things in the window that are not registry settings, so search can still find them. */
const UPDATES_SEARCH = {
	label: "Updates",
	description: "Get the newest version of VaultOps.",
	keywords: ["update", "version", "upgrade"],
};
const TEXT_SIZE_SEARCH = {
	label: "Text size",
	description: "Pixel sizes for body text and each heading level.",
	keywords: [
		"font size",
		"heading",
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"body",
	],
};
const TRANSFER_SEARCH = {
	label: "Export and import settings",
	description: "Copy your settings out as JSON, or load them from JSON.",
	keywords: ["backup", "restore", "json", "transfer"],
};

/** Whether any shortcut (or the word "shortcut") matches the search. */
function shortcutsMatch(query: string): boolean {
	const rest = query.replace(/shortcuts?|keyboard/gi, "").trim();
	return (
		matchesQuery({ label: "shortcuts keyboard" }, query) ||
		SHORTCUT_COMMANDS.some((c) =>
			matchesQuery(
				{ label: c.label, description: c.where, keywords: [c.keys] },
				rest,
			),
		)
	);
}

/** The text size settings are drawn together by `TextSizeSettings`, not row by row. */
const isTextSize = (def: SettingDef) => def.key.startsWith("editor.size.");

function modeOfDef(def: SettingDef): "light" | "dark" | null {
	const part = def.store?.path[0];
	return def.type === "color" && (part === "light" || part === "dark")
		? part
		: null;
}

/**
 * Settings: a left list of sections, a search box across all settings, and the
 * controls for one section at a time. Every control is generated from the
 * registry (`settings.ts`); each change is saved at once and applied to the
 * window. The registry decides what is valid, so a bad value never gets in.
 */
export function SettingsScreen({
	host,
	updatePollMs,
	initialSection = "appearance",
}: {
	host: UpdateHost;
	updatePollMs?: number;
	/** The section shown first. */
	initialSection?: string;
}) {
	const root = document.documentElement;
	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const [active, setActive] = useState(initialSection);
	const [query, setQuery] = useState("");

	useEffect(
		() =>
			settings.subscribe(() => {
				refreshAppearance(root);
				rerender();
			}),
		[],
	);

	const mode = resolveMode(
		settings.get("appearance.mode") as "light" | "dark" | "system",
		systemIsDark(),
	);

	const row = (def: Def, searching: boolean) => {
		if (def.key === "themes.theme") {
			const choice = settings.get("appearance.mode") as Mode;
			return (
				<ThemePicker
					key={def.key}
					def={def}
					themeId={String(settings.get(def.key))}
					mode={choice}
					shown={mode}
					onTheme={(next) => {
						settings.set("themes.theme", next);
						// Keep the mode the new theme can show.
						if (!themeSupports(next, choice)) {
							const first = MODES.find((m) => themeSupports(next, m.value));
							if (first) settings.set("appearance.mode", first.value);
						}
					}}
					onMode={(next) => settings.set("appearance.mode", next)}
				/>
			);
		}
		const defMode = modeOfDef(def);
		const colorKey = def.store?.path[1] as ColorKey | undefined;
		return (
			<SettingControl
				key={def.key}
				def={def}
				value={settings.get(def.key)}
				onChange={(value) =>
					// The registry checks the value; a bad one becomes the default.
					(settings.set as (key: string, value: unknown) => unknown)(
						def.key,
						value,
					)
				}
				labelSuffix={searching && defMode ? `${defMode} mode` : undefined}
				note={
					def.key === "appearance.accent"
						? accentNote(
								loadInterface().accent,
								mode,
								currentColor("--background", root),
							)
						: undefined
				}
				colorFallback={
					colorKey
						? currentColor(
								colorPreview[colorKey] ?? colorTokens[colorKey][0] ?? "",
								root,
							)
						: undefined
				}
			/>
		);
	};

	const sectionDefs = (id: string) =>
		ALL_DEFS.filter((def) => def.section === id);

	/** Colors show for the mode in use; search shows both modes. */
	const visible = (def: Def, searching: boolean) => {
		const defMode = modeOfDef(def);
		return searching || !defMode || defMode === mode;
	};

	const sectionBody = (id: string): ReactNode => {
		if (id === "shortcuts")
			return (
				<Group>
					<ShortcutsList />
					<p className="settings-note">
						Click a shortcut, then press the new keys. Two commands cannot share
						a shortcut.
					</p>
				</Group>
			);
		const defs = sectionDefs(id).filter(
			(def) => visible(def, false) && !isTextSize(def),
		);
		// Settings with the same group share one card, in the order groups first appear.
		const groups: { title?: string; defs: Def[] }[] = [];
		for (const def of defs) {
			const title = def.group;
			const found = groups.find((g) => g.title === title);
			if (found) found.defs.push(def);
			else groups.push({ title, defs: [def] });
		}
		const colors = defs.filter((def) => modeOfDef(def));
		return (
			<>
				{id === "general" && (
					<Group title="App">
						<div className="settings-row">
							<div className="settings-row-text">
								<span>Version</span>
								<p className="settings-note">
									The build this copy of VaultOps came from.
								</p>
							</div>
							<code>{buildCommit ?? "development build"}</code>
						</div>
						<UpdateSection host={host} pollMs={updatePollMs} />
					</Group>
				)}
				{id === "features" && (
					<p className="settings-note">
						Turn a feature off to hide it from the app. Your notes and files are
						never changed, and anything you already made with it still opens.
					</p>
				)}
				{colors.length > 0 && (
					<div className="settings-row settings-mode-note">
						<p className="settings-note">
							Every part of the theme can be tuned here. Colors you pick are for{" "}
							{mode} mode; switch to {mode === "dark" ? "light" : "dark"} mode
							under Appearance to set those separately.
						</p>
						<Button
							variant="secondary"
							disabled={colors.every((def) => settings.isDefault(def.key))}
							onClick={() => {
								// Only the mode in view goes back to the theme.
								for (const def of colors) settings.reset(def.key);
							}}
						>
							Reset {mode} colors
						</Button>
					</div>
				)}
				{groups.map((group) => (
					<Group key={group.defs[0]?.key} title={group.title}>
						{group.defs.map((def) => row(def, false))}
					</Group>
				))}
				{id === "editor" && (
					<Group>
						<TextSizeSettings />
					</Group>
				)}
				{id === "advanced" && (
					<Group>
						<SettingsTransfer />
					</Group>
				)}
			</>
		);
	};

	const nav = SECTIONS.filter(
		(s) => sectionDefs(s.id).length > 0 || CUSTOM_SECTIONS.has(s.id),
	);
	const current = nav.find((s) => s.id === active) ?? nav[0] ?? SECTIONS[0];
	const searching = query.trim() !== "";

	const results = () => {
		const found = ALL_DEFS.filter(
			(def) => def.type !== "shortcut" && !isTextSize(def),
		).filter((def) =>
			matchesQuery(
				def,
				query,
				SECTIONS.find((s) => s.id === def.section)?.label,
			),
		);
		const extras = [
			shortcutsMatch(query) && (
				<div key="shortcuts">
					<h3 className="section-label">Shortcuts</h3>
					<ShortcutsList
						filter={query.replace(/shortcuts?|keyboard/gi, "").trim()}
					/>
				</div>
			),
			matchesQuery(TEXT_SIZE_SEARCH, query, "Editor") && (
				<TextSizeSettings key="text-size" />
			),
			matchesQuery(UPDATES_SEARCH, query, "General") && (
				<UpdateSection key="updates" host={host} pollMs={updatePollMs} />
			),
			matchesQuery(TRANSFER_SEARCH, query, "Advanced") && (
				<SettingsTransfer key="transfer" />
			),
		].filter(Boolean);
		if (found.length === 0 && extras.length === 0)
			return (
				<p className="settings-note">No settings match “{query.trim()}”.</p>
			);
		return (
			<>
				{found.length > 0 && (
					<Group>{found.map((def) => row(def, true))}</Group>
				)}
				{extras}
			</>
		);
	};

	const body = (
		<div className="settings-body">
			<nav className="settings-nav" aria-label="Settings sections">
				<div className="settings-search">
					<Search aria-hidden="true" />
					<Input
						type="search"
						aria-label="Search settings"
						placeholder="Search settings"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</div>
				{nav.map((s) => (
					<button
						key={s.id}
						type="button"
						className="settings-nav-item"
						aria-current={
							!searching && s.id === current?.id ? "page" : undefined
						}
						onClick={() => {
							setQuery("");
							setActive(s.id);
						}}
					>
						{(() => {
							const Icon = SECTION_ICONS[s.id];
							return Icon ? (
								<Icon className="settings-nav-icon" aria-hidden="true" />
							) : null;
						})()}
						{s.label}
					</button>
				))}
			</nav>
			<div className="settings-content">
				<div className="settings-content-head">
					<h3 className="settings-content-title">
						{searching ? "Search results" : current?.label}
					</h3>
					{!searching && current && sectionDefs(current.id).length > 0 && (
						<Button
							variant="secondary"
							disabled={sectionDefs(current.id).every((def) =>
								settings.isDefault(def.key),
							)}
							onClick={() => settings.resetSection(current.id)}
						>
							Reset section
						</Button>
					)}
				</div>
				{searching ? results() : current && sectionBody(current.id)}
			</div>
		</div>
	);

	return (
		<section className="settings-window settings-window-inline">{body}</section>
	);
}

/** Export the settings as JSON, or import them back; bad entries are skipped and listed. */
function SettingsTransfer() {
	const [text, setText] = useState("");
	const [report, setReport] = useState<ImportReport | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const exportNow = async () => {
		const json = JSON.stringify(settings.exportSettings(), null, 2);
		setText(json);
		setReport(null);
		try {
			await navigator.clipboard.writeText(json);
			setMessage("Settings copied. They are also shown below.");
		} catch {
			setMessage("Settings are shown below; copy them from there.");
		}
	};
	const importNow = () => {
		let data: unknown;
		try {
			data = JSON.parse(text);
		} catch {
			setMessage(null);
			setReport({
				applied: [],
				skipped: [{ key: "(file)", reason: "not valid JSON" }],
			});
			return;
		}
		setMessage(null);
		setReport(settings.importSettings(data));
	};
	const readFile = async (file: File | undefined) => {
		if (file) setText(await file.text());
	};

	return (
		<>
			<h3 className="section-label">Export and import</h3>
			<p className="settings-note">
				Export copies your settings as JSON. To import, paste JSON below or
				choose a file; anything that is not a valid setting is skipped.
			</p>
			<textarea
				className="settings-transfer"
				aria-label="Settings JSON"
				value={text}
				onChange={(event) => setText(event.target.value)}
				spellCheck={false}
			/>
			<div className="settings-actions">
				<Button variant="secondary" onClick={() => void exportNow()}>
					Export settings
				</Button>
				<Button
					variant="secondary"
					disabled={text.trim() === ""}
					onClick={importNow}
				>
					Import settings
				</Button>
				<input
					type="file"
					accept="application/json,.json"
					aria-label="Choose a settings file"
					onChange={(event) => void readFile(event.target.files?.[0])}
				/>
			</div>
			{message && <p className="settings-note">{message}</p>}
			{report && (
				<div className="settings-note" role="status">
					Imported {report.applied.length} setting
					{report.applied.length === 1 ? "" : "s"}
					{report.skipped.length > 0 && `, skipped ${report.skipped.length}`}.
					{report.skipped.length > 0 && (
						<ul>
							{report.skipped.map((s) => (
								<li key={s.key}>
									{s.key}: {s.reason}
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</>
	);
}

export function SettingsDialog({
	open,
	onOpenChange,
	host,
	focusRequest,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	host: UpdateHost;
	focusRequest?: object;
}) {
	return (
		<FloatingWindow
			open={open}
			title="Settings"
			kind="settings"
			initial={{ left: innerWidth - 652, top: 56, width: 620, height: 660 }}
			focusRequest={focusRequest}
			onClose={() => onOpenChange(false)}
		>
			<SettingsScreen host={host} />
		</FloatingWindow>
	);
}
