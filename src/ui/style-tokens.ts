/**
 * Style settings: the theme's look values a user can change from Settings >
 * Themes, in the spirit of Obsidian's Style Settings plugin. Each entry is one
 * row: a choice of preset values for one or more CSS variables, or a switch
 * that sets a data attribute on the root. "Theme" (the default) leaves the
 * theme's own value alone.
 *
 * Colors are not here: they are per light/dark mode and live with the other
 * color overrides in `appearance.ts`.
 */

export interface StyleChoice {
	value: string;
	label: string;
	/** CSS variables this choice sets on the root. */
	vars: Record<string, string>;
}

export type StyleToken =
	| {
			kind: "select";
			key: string;
			group: string;
			label: string;
			description: string;
			keywords?: readonly string[];
			choices: readonly StyleChoice[];
	  }
	| {
			kind: "toggle";
			key: string;
			group: string;
			label: string;
			description: string;
			keywords?: readonly string[];
			/** Set on the root while the switch is off. */
			offAttribute: string;
	  };

const px = (n: number) => `${n}px`;

export const STYLE_TOKENS: readonly StyleToken[] = [
	{
		kind: "select",
		key: "themes.style.radius",
		group: "Shape and spacing",
		label: "Corner roundness",
		description: "How rounded panels, cards, buttons and blocks are.",
		keywords: ["radius", "corners", "rounded", "square"],
		choices: [
			{
				value: "square",
				label: "Square",
				vars: { "--radius-1": px(2), "--radius-2": px(4) },
			},
			{
				value: "soft",
				label: "Soft",
				vars: { "--radius-1": px(5), "--radius-2": px(9) },
			},
			{
				value: "round",
				label: "Round",
				vars: { "--radius-1": px(8), "--radius-2": px(14) },
			},
			{
				value: "extra",
				label: "Extra round",
				vars: { "--radius-1": px(12), "--radius-2": px(20) },
			},
		],
	},
	{
		kind: "select",
		key: "themes.style.panelGap",
		group: "Shape and spacing",
		label: "Gap between panels",
		description: "Space around the sidebars and the editor.",
		keywords: ["gap", "gutter", "padding", "panels"],
		choices: [
			{ value: "none", label: "None", vars: { "--shell-gap": px(0) } },
			{ value: "tight", label: "Tight", vars: { "--shell-gap": px(4) } },
			{ value: "normal", label: "Normal", vars: { "--shell-gap": px(8) } },
			{ value: "wide", label: "Wide", vars: { "--shell-gap": px(14) } },
		],
	},
	{
		kind: "select",
		key: "themes.style.controls",
		group: "Shape and spacing",
		label: "Button and field height",
		description: "How tall buttons, inputs and menus are.",
		keywords: ["density", "compact", "control", "button", "height"],
		choices: [
			{
				value: "compact",
				label: "Compact",
				vars: { "--control-height": px(24), "--control-height-sm": px(20) },
			},
			{
				value: "normal",
				label: "Normal",
				vars: { "--control-height": px(28), "--control-height-sm": px(24) },
			},
			{
				value: "large",
				label: "Large",
				vars: { "--control-height": px(32), "--control-height-sm": px(28) },
			},
		],
	},
	{
		kind: "select",
		key: "themes.style.sidebarRow",
		group: "Window and sidebars",
		label: "Row height",
		description: "Height of each folder and note row in the sidebar.",
		keywords: ["density", "rows", "tree", "file list"],
		choices: [
			{
				value: "compact",
				label: "Compact",
				vars: { "--sidebar-row-height": px(24) },
			},
			{
				value: "normal",
				label: "Normal",
				vars: { "--sidebar-row-height": px(28) },
			},
			{
				value: "roomy",
				label: "Roomy",
				vars: { "--sidebar-row-height": px(34) },
			},
		],
	},
	{
		kind: "toggle",
		key: "themes.style.sectionCaps",
		group: "Window and sidebars",
		label: "Uppercase section labels",
		description: "Labels like NOTES and TODAY'S LOG in capitals.",
		keywords: ["caps", "labels", "headings", "uppercase"],
		offAttribute: "data-plain-labels",
	},
	{
		kind: "select",
		key: "themes.style.blockGap",
		group: "Editor",
		label: "Space between blocks",
		description: "Room between paragraphs and other blocks in a note.",
		keywords: ["paragraph spacing", "block gap", "density"],
		choices: [
			{ value: "tight", label: "Tight", vars: { "--block-gap": "0.25rem" } },
			{ value: "normal", label: "Normal", vars: { "--block-gap": "0.6rem" } },
			{ value: "airy", label: "Airy", vars: { "--block-gap": "1rem" } },
		],
	},
	{
		kind: "select",
		key: "themes.style.headingWeight",
		group: "Headings",
		label: "Heading weight",
		description: "How bold headings H1 to H6 are.",
		keywords: ["bold", "font weight", "headers"],
		choices: [
			{ value: "500", label: "Medium", vars: { "--heading-weight": "500" } },
			{ value: "600", label: "Semibold", vars: { "--heading-weight": "600" } },
			{ value: "700", label: "Bold", vars: { "--heading-weight": "700" } },
			{ value: "800", label: "Heavy", vars: { "--heading-weight": "800" } },
		],
	},
	{
		kind: "select",
		key: "themes.style.listIndent",
		group: "Lists",
		label: "Indent per level",
		description: "How far each nested list steps in.",
		keywords: ["indent", "nesting", "bullets", "numbers"],
		choices: [
			{ value: "narrow", label: "Narrow", vars: { "--list-indent": "0.8em" } },
			{ value: "normal", label: "Normal", vars: { "--list-indent": "1.2em" } },
			{ value: "wide", label: "Wide", vars: { "--list-indent": "1.8em" } },
		],
	},
	{
		kind: "select",
		key: "themes.style.listGap",
		group: "Lists",
		label: "Space between items",
		description: "Room between list items.",
		keywords: ["spacing", "bullets", "numbers"],
		choices: [
			{ value: "tight", label: "Tight", vars: { "--list-gap": "0" } },
			{ value: "normal", label: "Normal", vars: { "--list-gap": "0.2rem" } },
			{ value: "airy", label: "Airy", vars: { "--list-gap": "0.5rem" } },
		],
	},
	{
		kind: "toggle",
		key: "themes.style.listGuides",
		group: "Lists",
		label: "Indent guides",
		description: "A thin line beside each nested list.",
		keywords: ["guides", "lines", "nesting"],
		offAttribute: "data-hide-list-guides",
	},
	{
		kind: "select",
		key: "themes.style.quoteBar",
		group: "Quotes",
		label: "Bar width",
		description: "The colored bar down the side of a quote.",
		keywords: ["blockquote", "border", "bar"],
		choices: [
			{ value: "thin", label: "Thin", vars: { "--quote-bar-width": px(2) } },
			{
				value: "normal",
				label: "Normal",
				vars: { "--quote-bar-width": px(4) },
			},
			{ value: "thick", label: "Thick", vars: { "--quote-bar-width": px(6) } },
		],
	},
	{
		kind: "select",
		key: "themes.style.calloutBar",
		group: "Callouts",
		label: "Bar width",
		description: "The colored bar down the side of a callout.",
		keywords: ["callout", "border", "bar", "admonition"],
		choices: [
			{ value: "none", label: "None", vars: { "--callout-bar-width": px(0) } },
			{ value: "thin", label: "Thin", vars: { "--callout-bar-width": px(2) } },
			{
				value: "normal",
				label: "Normal",
				vars: { "--callout-bar-width": px(4) },
			},
			{
				value: "thick",
				label: "Thick",
				vars: { "--callout-bar-width": px(6) },
			},
		],
	},
	{
		kind: "toggle",
		key: "themes.style.calloutFill",
		group: "Callouts",
		label: "Tinted background",
		description: "Fill callouts with their color. Off leaves just the outline.",
		keywords: ["callout", "background", "outline", "fill"],
		offAttribute: "data-outline-callouts",
	},
	{
		kind: "select",
		key: "themes.style.codeSize",
		group: "Code",
		label: "Code text size",
		description: "Size of code blocks and inline code, next to the note text.",
		keywords: ["monospace", "code font", "size"],
		choices: [
			{
				value: "small",
				label: "Small",
				vars: { "--code-font-size": "0.85em" },
			},
			{
				value: "normal",
				label: "Normal",
				vars: { "--code-font-size": "0.92em" },
			},
			{ value: "large", label: "Large", vars: { "--code-font-size": "1em" } },
		],
	},
];

/** Every CSS variable a style setting can set, so turning one off clears it. */
const ALL_VARS = [
	...new Set(
		STYLE_TOKENS.flatMap((t) =>
			t.kind === "select" ? t.choices.flatMap((c) => Object.keys(c.vars)) : [],
		),
	),
];

/** The stored style settings from the `vaultops.settings` blob. */
export function loadStyle(
	storage?: Pick<Storage, "getItem">,
): Record<string, unknown> {
	try {
		return (
			(JSON.parse(
				(storage ?? localStorage).getItem("vaultops.settings") ?? "null",
			) as Record<string, unknown> | null) ?? {}
		);
	} catch {
		return {};
	}
}

/**
 * Apply the style settings: chosen values go inline on the root (so they beat
 * every theme), switches that are off set their data attribute, and anything
 * left on "Theme" is cleared.
 */
export function applyStyle(
	root: Pick<HTMLElement, "style" | "toggleAttribute">,
	stored: Record<string, unknown>,
) {
	const set = new Map<string, string>();
	for (const token of STYLE_TOKENS) {
		const value = stored[token.key];
		if (token.kind === "select") {
			const choice = token.choices.find((c) => c.value === value);
			for (const [name, v] of Object.entries(choice?.vars ?? {}))
				set.set(name, v);
		} else {
			root.toggleAttribute(token.offAttribute, value === false);
		}
	}
	for (const name of ALL_VARS) {
		const value = set.get(name);
		if (value !== undefined) root.style.setProperty(name, value);
		else root.style.removeProperty(name);
	}
}

/**
 * Custom CSS as it is put into the window. Anything that could reach the
 * network (an `@import`, or a `url()` that isn't an inline `data:` image) is
 * dropped: the app makes no network requests of its own.
 */
export function safeCustomCss(css: string): string {
	return css
		.replace(/@import[^;]*;?/gi, "")
		.replace(/url\(\s*(['"]?)(?!data:)[^)]*\1\s*\)/gi, "none");
}

const CUSTOM_CSS_ID = "vaultops-custom-css";

/** Put the custom CSS (or nothing) into a style element of its own. */
export function applyCustomCss(doc: Document, css: string) {
	let style = doc.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null;
	const text = safeCustomCss(css).trim();
	if (!text) {
		style?.remove();
		return;
	}
	if (!style) {
		style = doc.createElement("style");
		style.id = CUSTOM_CSS_ID;
		doc.head.append(style);
	}
	if (style.textContent !== text) style.textContent = text;
}
