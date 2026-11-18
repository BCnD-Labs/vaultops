/**
 * The built-in features: every optional part of VaultOps, declared once as
 * data. The Settings > Features page, the on/off storage and the places that
 * hide a feature all read this list.
 *
 * A feature that is off is only hidden from the ways to create or open it. It
 * never touches the user's files: existing canvases, database blocks and math
 * in notes keep opening and rendering as before.
 *
 * Pure TypeScript: the on/off state is a plain `{ id: boolean }` map that the
 * caller reads from and writes to storage.
 */

export interface Feature {
	/** Stable id, saved with the setting: never rename one. */
	id: string;
	name: string;
	/** One line, plain words: what you lose when it is off. */
	description: string;
	/** The heading it is listed under on the Features page. */
	group: string;
	defaultOn: boolean;
	/**
	 * Always on, and left off the Features page (there is no switch for it).
	 * None of today's features is core; the flag is here for later ones.
	 */
	core?: boolean;
}

/** The headings of the Features page, in order. */
export const FEATURE_GROUPS = [
	"Writing",
	"Organising",
	"Planning",
	"Visual",
	"Note tools",
] as const;

export const FEATURES: readonly Feature[] = [
	{
		id: "word-complete",
		group: "Writing",
		name: "Word completion",
		description: "Suggests words you've used before as you type.",
		defaultOn: true,
	},
	{
		id: "math",
		name: "Math",
		description: "Math blocks in notes, from the slash menu.",
		group: "Writing",
		defaultOn: true,
	},
	{
		id: "database-blocks",
		name: "Database blocks",
		description:
			"Tables you can sort and filter inside a note, from the slash menu.",
		group: "Writing",
		defaultOn: true,
	},
	{
		id: "templates",
		name: "Templates",
		description: "The Template manager and starting a note from a template.",
		group: "Organising",
		defaultOn: true,
	},
	{
		id: "resources",
		name: "Resource manager",
		description: "Cards for people, books and articles, kept in your notes.",
		group: "Organising",
		defaultOn: true,
	},
	{
		id: "planner",
		name: "Planner",
		description:
			"The daily log, calendar and the Planner tab in the right sidebar.",
		group: "Planning",
		defaultOn: true,
	},
	{
		id: "canvas",
		name: "Canvas",
		description: "Creating new canvases. Canvases you already have still open.",
		group: "Visual",
		defaultOn: true,
	},
	{
		id: "tab-properties",
		name: "Properties tab",
		description: "The Properties tab in the right sidebar.",
		group: "Note tools",
		defaultOn: true,
	},
	{
		id: "tab-outline",
		name: "Outline tab",
		description: "The Outline tab in the right sidebar.",
		group: "Note tools",
		defaultOn: true,
	},
	{
		id: "tab-links",
		name: "Linked from tab",
		description: "The Linked from tab in the right sidebar.",
		group: "Note tools",
		defaultOn: true,
	},
];

/** Stored on/off choices by feature id. Ids that are not declared here are kept as they are. */
export type FeatureState = Readonly<Record<string, boolean>>;

const byId = new Map(FEATURES.map((feature) => [feature.id, feature]));

export function featureById(id: string): Feature | undefined {
	return byId.get(id);
}

/**
 * Whether a feature is on. A core feature is always on; a feature with no
 * stored choice (a new one) uses its default; an id nobody declared counts as
 * on, so a mistyped id never hides anything.
 */
export function isEnabled(id: string, state: FeatureState): boolean {
	const feature = byId.get(id);
	if (!feature) return true;
	if (feature.core) return true;
	const stored = state[id];
	return typeof stored === "boolean" ? stored : feature.defaultOn;
}

/** A copy of the state with one feature switched. Every other id, known or not, stays. */
export function withFeature(
	state: FeatureState,
	id: string,
	on: boolean,
): FeatureState {
	return { ...state, [id]: on };
}

/** The features of one group that have a switch on the page (core ones do not). */
export function switchable(group: string): Feature[] {
	return FEATURES.filter((f) => f.group === group && !f.core);
}

/** The settings key that stores one feature's switch. */
export const featureSettingKey = (id: string) => `features.${id}`;

/**
 * Which slash-menu item belongs to which feature (slash item id to feature
 * id). The slash menu can filter its items with `slashItemEnabled`.
 */
export const SLASH_ITEM_FEATURE: Readonly<Record<string, string>> = {
	math: "math",
	database: "database-blocks",
};

/** Whether a slash item should be offered; items that belong to no feature always are. */
export function slashItemEnabled(
	slashItemId: string,
	state: FeatureState,
): boolean {
	const feature = SLASH_ITEM_FEATURE[slashItemId];
	return feature === undefined || isEnabled(feature, state);
}
