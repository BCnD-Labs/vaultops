/**
 * Font choices kept apart from the theme: the text you write in, and the type
 * for titles, tags and headings. Each is a data attribute on the root; the
 * matching font stacks live in themes/fonts.css, so no font name is written here.
 */
export const editorFonts = [
	["theme", "Match theme"],
	["atkinson", "Atkinson Hyperlegible"],
] as const;
export const headingFonts = [
	["theme", "Match theme"],
	["inter", "Inter"],
	["sora", "Sora"],
] as const;

export type FontChoice = {
	editor: (typeof editorFonts)[number][0];
	heading: (typeof headingFonts)[number][0];
};

const key = "vaultops.fonts";
const fallback: FontChoice = { editor: "theme", heading: "theme" };

export function loadFontChoice(storage?: Pick<Storage, "getItem">): FontChoice {
	try {
		const raw = JSON.parse((storage ?? localStorage).getItem(key) ?? "null");
		const editor = editorFonts.find(([id]) => id === raw?.editor)?.[0];
		const heading = headingFonts.find(([id]) => id === raw?.heading)?.[0];
		return {
			editor: editor ?? fallback.editor,
			heading: heading ?? fallback.heading,
		};
	} catch {
		return { ...fallback };
	}
}

export function saveFontChoice(
	choice: FontChoice,
	storage?: Pick<Storage, "setItem">,
) {
	try {
		(storage ?? localStorage).setItem(key, JSON.stringify(choice));
	} catch {
		/* Storage may be disabled. */
	}
}

export function applyFonts(
	root: Pick<HTMLElement, "setAttribute" | "removeAttribute">,
	choice: FontChoice,
) {
	for (const [attribute, value] of [
		["data-editor-font", choice.editor],
		["data-heading-font", choice.heading],
	] as const) {
		if (value === "theme") root.removeAttribute(attribute);
		else root.setAttribute(attribute, value);
	}
}
