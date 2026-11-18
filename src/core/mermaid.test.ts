import { expect, it } from "vitest";
import {
	describeMermaidError,
	mermaidColor,
	mermaidThemeVariables,
} from "./mermaid";

it("says what is wrong and on which line, without the parser dump", () => {
	const jison = Object.assign(
		new Error(
			"Parse error on line 2:\nA --> ;\n------^\nExpecting 'ID', got 'SEMI'",
		),
		{ hash: { text: ";", token: "SEMI", loc: { first_line: 2 } } },
	);
	expect(describeMermaidError(jison)).toBe("Line 2: didn't expect “;”");
	expect(
		describeMermaidError({ message: "Parse error on line 3:\ngot 'EOF'" }),
	).toBe("Line 3: the diagram ends too soon");
	expect(
		describeMermaidError({ message: "Parse error on line 2:\ngot 'NEWLINE'" }),
	).toBe("Line 2: the line ends too soon");
	expect(
		describeMermaidError(
			new Error(
				"Parsing failed: Lexer error on line 4, column 2: unexpected character: ->%<- at offset: 30, skipped 1 characters.",
			),
		),
	).toBe("Line 4: unexpected character: ->%<-");
	expect(
		describeMermaidError(new Error("No diagram type detected for text: hi")),
	).toMatch(/^Start with a diagram type/);
	expect(describeMermaidError(null)).toBe("The diagram text can't be read");
});

it("maps theme tokens to base-theme variables Mermaid can read", () => {
	expect(mermaidColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
	expect(mermaidColor("color(srgb 1 0 0.5)")).toBe("rgb(255,0,128)");
	expect(mermaidColor("oklch(0.5 0.1 200)")).toBeNull();
	const read = (bg: string) => (token: string) =>
		token === "--editor-code-bg" ? bg : null;
	expect(mermaidThemeVariables(read("rgb(27, 29, 34)"), "Inter")).toEqual({
		background: "rgb(27, 29, 34)",
		edgeLabelBackground: "rgb(27, 29, 34)",
		darkMode: true,
		fontFamily: "Inter",
	});
	expect(mermaidThemeVariables(read("rgb(250, 251, 252)"), "").darkMode).toBe(
		false,
	);
	expect(mermaidThemeVariables(() => null, "").darkMode).toBe(false);
});

it("pairs mind map fills with the theme's readable label colors", () => {
	const tokens: Record<string, string> = {
		"--editor-code-bg": "rgb(27, 29, 34)",
		"--accent": "rgb(54, 60, 90)",
		"--accent-foreground": "rgb(221, 225, 255)",
		"--border": "rgb(65, 70, 80)",
		"--surface-container-high": "rgb(50, 54, 61)",
		"--foreground": "rgb(230, 233, 240)",
	};
	expect(
		mermaidThemeVariables((token) => tokens[token] ?? null, "", true),
	).toMatchObject({
		git0: tokens["--accent"],
		gitBranchLabel0: tokens["--accent-foreground"],
		cScale1: tokens["--border"],
		cScaleLabel1: tokens["--foreground"],
		cScale3: tokens["--surface-container-high"],
		cScaleLabel3: tokens["--foreground"],
	});
});
