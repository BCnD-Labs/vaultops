import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { themes } from "./index";

// Frame, panel and surface are the three layers every theme stacks (window
// frame behind, sidebar panels, editor surface). If two layers are nearly the
// same colour the rounded panels disappear into the frame, so each theme must
// keep a minimum visible step between them.

type Palette = Record<number, string>;

function pick(set: Palette | undefined, n: number): string {
	const value = set?.[n];
	if (!value) throw new Error(`missing --neutral-${n}`);
	return value;
}

const dir = __dirname;

function read(id: string): string {
	return readFileSync(join(dir, `${id}.css`), "utf8");
}

// Every `--neutral-N: #hex;` in file order. The first set is light, the
// second is `[data-mode="dark"]`, the third is the prefers-color-scheme copy.
function neutralSets(css: string): Palette[] {
	const sets: Palette[] = [];
	let current: Palette = {};
	let last = -1;
	for (const m of css.matchAll(/--neutral-(\d):\s*(#[0-9a-fA-F]{6});/g)) {
		const n = Number(m[1]);
		if (n <= last) {
			sets.push(current);
			current = {};
		}
		current[n] = (m[2] ?? "").toLowerCase();
		last = n;
	}
	sets.push(current);
	return sets;
}

function luminance(hex: string): number {
	const channel = (i: number) => {
		const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function ratio(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe.each(themes)("theme layer separation: $id", ({ id }) => {
	const sets = neutralSets(read(id));

	it("defines light, dark and system-dark neutrals", () => {
		expect(sets).toHaveLength(3);
	});

	it("keeps both dark blocks identical", () => {
		expect(sets[2]).toEqual(sets[1]);
	});

	it("keeps frame, panel and surface visibly apart", () => {
		const min = [
			{ set: sets[0], frame: 1.07, surface: 1.0 },
			{ set: sets[1], frame: 1.1, surface: 1.08 },
		];
		for (const { set, frame, surface } of min) {
			expect(ratio(pick(set, 2), pick(set, 1))).toBeGreaterThanOrEqual(frame);
			expect(ratio(pick(set, 1), pick(set, 0))).toBeGreaterThanOrEqual(surface);
		}
	});

	it("keeps hover steps distinct from the frame", () => {
		for (const set of [sets[0], sets[1]]) {
			expect(pick(set, 3)).not.toBe(pick(set, 2));
			expect(ratio(pick(set, 3), pick(set, 2))).toBeGreaterThan(1.0);
		}
	});
});

// Daylight is for direct sunlight, where glare flattens small steps: its dark
// page, panel and selected surfaces must differ clearly and its borders must
// stand out against the panel.
describe("daylight dark surfaces", () => {
	const css = read("daylight");
	const dark = css.split('[data-mode="dark"]')[1] ?? "";
	const token = (name: string): string => {
		const value = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(
			dark,
		)?.[1];
		if (!value) throw new Error(`missing --${name} in daylight dark`);
		return value.toLowerCase();
	};
	it("steps page, panel and selected surfaces by a clear amount", () => {
		const page = token("neutral-0");
		const panel = token("neutral-1");
		const selected = token("seed-container");
		expect(luminance(page)).toBeGreaterThan(0.02);
		expect(ratio(panel, page)).toBeGreaterThanOrEqual(1.15);
		expect(ratio(selected, panel)).toBeGreaterThanOrEqual(1.3);
		expect(ratio(token("neutral-2"), panel)).toBeGreaterThanOrEqual(1.1);
	});
	it("keeps borders at 3:1 or more against the panel", () => {
		expect(
			ratio(token("neutral-4"), token("neutral-1")),
		).toBeGreaterThanOrEqual(3);
	});
});
