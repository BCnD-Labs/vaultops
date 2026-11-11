// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Switch } from "@/components/ui/switch";

afterEach(cleanup);

const css = readFileSync(
	resolve(process.cwd(), "src/editor/editor.css"),
	"utf8",
);

// The off state is drawn with diagonal lines running like "/", not horizontal ones.
it("draws the off block's scan lines diagonally, like forward slashes", () => {
	const start = css.indexOf('.switch-block[data-off="true"]::after');
	expect(start).toBeGreaterThan(-1);
	const rule = css.slice(start, css.indexOf("}", start));
	// 135deg runs the gradient toward the bottom right, so its stripes run "/".
	expect(rule).toMatch(/repeating-linear-gradient\(\s*135deg/);
	expect(rule).not.toMatch(/to bottom/);
});

// Tailwind's reset is left out, so a bare button keeps the browser's side
// padding, which pushed the knob out past the track when it was on.
it("gives the switch no padding of its own, so the knob stays inside the track", () => {
	render(<Switch checked aria-label="on/off" />);
	expect(screen.getByRole("switch").className).toMatch(/(^|\s)p-0(\s|$)/);
});
