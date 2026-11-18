/**
 * Pure helpers for Mermaid diagram blocks: plain words for a parse error, and
 * the app's colour tokens mapped to Mermaid's `base` theme variables.
 */

interface ParseError {
	message?: unknown;
	hash?: { text?: unknown; token?: unknown; loc?: { first_line?: unknown } };
}

/** "Line 2: didn't expect “-->”" instead of the parser's dump; never a stack. */
export function describeMermaidError(error: unknown): string {
	const { message: raw, hash = {} } = (error ?? {}) as ParseError;
	const message = typeof raw === "string" ? raw : "";
	if (/no diagram type detected/i.test(message)) {
		return "Start with a diagram type, such as flowchart TD or sequenceDiagram.";
	}
	const line =
		typeof hash.loc?.first_line === "number"
			? hash.loc.first_line
			: Number(/line (\d+)/i.exec(message)?.[1]) || null;
	const token =
		typeof hash.token === "string"
			? hash.token
			: /got '([^']+)'/.exec(message)?.[1];
	const text = typeof hash.text === "string" ? hash.text.trim() : "";
	const what =
		token === "EOF"
			? "the diagram ends too soon"
			: token === "NEWLINE"
				? "the line ends too soon"
				: text
					? `didn't expect “${text}”`
					: token
						? `didn't expect ${token.toLowerCase()}`
						: message
								.split("\n")[0]
								?.replace(/^(parsing failed|parse error|error):?\s*/i, "")
								.replace(/^\w+ error on line \d+, column \d+:\s*/i, "")
								.replace(/\s+at offset.*$/i, "")
								.slice(0, 120) || "the diagram text can't be read";
	return line
		? `Line ${line}: ${what}`
		: what.charAt(0).toUpperCase() + what.slice(1);
}

/** Mermaid `base` theme variable -> the app colour token it takes. */
export const MERMAID_COLOR_TOKENS: Readonly<Record<string, string>> = {
	background: "--editor-code-bg",
	primaryColor: "--surface",
	primaryTextColor: "--foreground",
	primaryBorderColor: "--primary",
	secondaryColor: "--accent",
	tertiaryColor: "--surface-container-low",
	lineColor: "--muted-foreground",
	textColor: "--foreground",
	noteBkgColor: "--surface-container-high",
	edgeLabelBackground: "--editor-code-bg",
};

/**
 * A computed colour Mermaid can lighten and darken, or null (left to Mermaid's
 * default): `rgb()` passes, `color(srgb …)` becomes `rgb()`.
 */
export function mermaidColor(value: string): string | null {
	if (/^rgba?\(/.test(value)) return value;
	const srgb = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/.exec(value);
	return srgb
		? `rgb(${srgb.slice(1, 4).map((n) => Math.round(Number(n) * 255))})`
		: null;
}

/** Theme variables from a token reader (returns a usable colour or null). */
export function mermaidThemeVariables(
	color: (token: string) => string | null,
	fontFamily: string,
): Record<string, string | boolean> {
	const variables: Record<string, string | boolean> = { fontFamily };
	for (const [name, token] of Object.entries(MERMAID_COLOR_TOKENS)) {
		const value = color(token);
		if (value) variables[name] = value;
	}
	// A dark background (by its brightness) draws a dark-mode diagram.
	const [r = 255, g = 255, b = 255] =
		String(variables.background ?? "")
			.match(/[\d.]+/g)
			?.map(Number) ?? [];
	variables.darkMode = 0.299 * r + 0.587 * g + 0.114 * b < 128;
	return variables;
}
