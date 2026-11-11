// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { applyStyle, STYLE_TOKENS, safeCustomCss } from "./style-tokens";

it("sets a preset's variables, clears them on Theme, and maps switches to attributes", () => {
	const root = document.createElement("div");
	applyStyle(root, {
		"themes.style.listIndent": "wide",
		"themes.style.calloutFill": false,
	});
	expect(root.style.getPropertyValue("--list-indent")).toBe("1.8em");
	expect(root.hasAttribute("data-outline-callouts")).toBe(true);
	applyStyle(root, { "themes.style.listIndent": "theme" });
	expect(root.style.getPropertyValue("--list-indent")).toBe("");
	expect(root.hasAttribute("data-outline-callouts")).toBe(false);
});

it("gives every style setting a unique key and a group", () => {
	const keys = STYLE_TOKENS.map((t) => t.key);
	expect(new Set(keys).size).toBe(keys.length);
	for (const token of STYLE_TOKENS) expect(token.group).not.toBe("");
});

it("drops anything in custom CSS that would reach the network", () => {
	expect(
		safeCustomCss(
			"@import 'https://a.test/x.css';\n.a{background:url('https://a.test/i.png')} .b{background:url(data:image/png;base64,AA)}",
		),
	).toBe(
		".a{background:none} .b{background:url(data:image/png;base64,AA)}".replace(
			".a",
			"\n.a",
		),
	);
});
