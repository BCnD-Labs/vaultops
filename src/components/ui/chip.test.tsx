// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TONES } from "@/app/appearance";
import { Chip } from "./chip";

afterEach(cleanup);

describe("Chip", () => {
	it("renders its text, neutral without a tone", () => {
		render(<Chip>idea</Chip>);
		const chip = screen.getByText("idea");
		expect(chip.getAttribute("data-slot")).toBe("chip");
		expect(chip.hasAttribute("data-tone")).toBe(false);
		expect(chip.className).toContain("text-foreground");
		expect(screen.queryByRole("button")).toBeNull();
	});

	it("takes its colour from the tag tone and pulls the text toward the foreground", () => {
		render(<Chip tone="yellow">test</Chip>);
		const chip = screen.getByText("test");
		expect(chip.getAttribute("data-tone")).toBe("yellow");
		expect(chip.style.getPropertyValue("--chip-tone")).toBe(
			"var(--tone-yellow)",
		);
		expect(chip.className).toContain(
			"calc(var(--tone-text-mix)-15%),var(--foreground)",
		);
	});

	it("shows a labelled remove button that calls onRemove", async () => {
		const onRemove = vi.fn();
		render(
			<Chip tone="blue" onRemove={onRemove} removeLabel="Remove tag test">
				test
			</Chip>,
		);
		await userEvent.click(
			screen.getByRole("button", { name: "Remove tag test" }),
		);
		expect(onRemove).toHaveBeenCalledOnce();
	});
});

// Chip text is the tone mixed (--tone-text-mix less 15 points) toward the foreground, on the tone at
// 18% over the page background. Check that for every tone in the default theme.
describe("Chip contrast", () => {
	const css = readFileSync("src/ui/themes/default.css", "utf8");
	const light = Object.fromEntries(
		[
			...(/\{([^{}]*)\}/.exec(css)?.[1] ?? "").matchAll(
				/--([\w-]+):\s*([^;]+);/g,
			),
		].map((m) => [m[1], (m[2] ?? "").trim()]),
	);
	const darkBlock = /\[data-mode="dark"\]\s*\{([^{}]*)\}/.exec(css)?.[1] ?? "";
	const dark = {
		...light,
		...Object.fromEntries(
			[...darkBlock.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [
				m[1],
				(m[2] ?? "").trim(),
			]),
		),
	};
	type Rgb = [number, number, number];
	const toRgb = (hex: string): Rgb =>
		[1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb;
	const mix = (a: Rgb, b: Rgb, aShare: number): Rgb =>
		a.map((v, i) => v * aShare + (b[i] ?? 0) * (1 - aShare)) as Rgb;
	const lum = (c: Rgb) => {
		const [r, g, b] = c.map((v) => {
			const x = v / 255;
			return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
		}) as Rgb;
		return r * 0.2126 + g * 0.7152 + b * 0.0722;
	};
	const ratio = (a: Rgb, b: Rgb) =>
		(Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

	it.each(
		[false, true].flatMap((isDark) => TONES.map((t) => [isDark, t] as const)),
	)("dark=%s tone %s keeps text above 4.5:1", (isDark, tone) => {
		const t: Record<string, string> = isDark ? dark : light;
		const resolve = (key: string): string => {
			const v = t[key] ?? "";
			return v.startsWith("var(") ? resolve(v.slice(6, -1)) : v;
		};
		const toneRgb = toRgb(resolve(`tone-${tone}`));
		const fg = toRgb(resolve("foreground"));
		const textShare =
			(Number.parseInt(resolve("tone-text-mix"), 10) - 15) / 100;
		const text = mix(toneRgb, fg, textShare);
		for (const bgKey of ["background", "surface-container", "surface"]) {
			const page = toRgb(resolve(bgKey));
			const fill = mix(toneRgb, page, 0.18);
			expect(
				ratio(text, fill),
				`${isDark ? "dark" : "light"} ${tone} on ${bgKey}`,
			).toBeGreaterThanOrEqual(4.5);
		}
	});
});
