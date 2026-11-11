/** Colour maths and recent-colour storage for the colour picker. Plain functions, no React. */

export interface Hsv {
	/** 0 to 360 */
	h: number;
	/** 0 to 1 */
	s: number;
	/** 0 to 1 */
	v: number;
}

/** `#abc` or `#AABBCC` (the `#` is optional) become `#aabbcc`; anything else is null. */
export function parseHex(value: string): string | null {
	const text = value.trim().replace(/^#/, "");
	if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text)) return null;
	const full = text.length === 3 ? [...text].map((c) => c + c).join("") : text;
	return `#${full.toLowerCase()}`;
}

export function hexToHsv(hex: string): Hsv {
	const norm = parseHex(hex) ?? "#000000";
	const r = Number.parseInt(norm.slice(1, 3), 16) / 255;
	const g = Number.parseInt(norm.slice(3, 5), 16) / 255;
	const b = Number.parseInt(norm.slice(5, 7), 16) / 255;
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
	const hh = (((h % 360) + 360) % 360) / 60;
	const c = v * s;
	const x = c * (1 - Math.abs((hh % 2) - 1));
	const m = v - c;
	const [r, g, b] =
		hh < 1
			? [c, x, 0]
			: hh < 2
				? [x, c, 0]
				: hh < 3
					? [0, c, x]
					: hh < 4
						? [0, x, c]
						: hh < 5
							? [x, 0, c]
							: [c, 0, x];
	const to = (n: number) =>
		Math.round((n + m) * 255)
			.toString(16)
			.padStart(2, "0");
	return `#${to(r)}${to(g)}${to(b)}`;
}

export const clamp = (n: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, n));

const RECENT_KEY = "vaultops.recentColors";
const RECENT_MAX = 8;

export function readRecentColors(
	storage: Pick<Storage, "getItem"> = localStorage,
): string[] {
	try {
		const raw: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? "[]");
		if (!Array.isArray(raw)) return [];
		return raw
			.map((v) => (typeof v === "string" ? parseHex(v) : null))
			.filter((v): v is string => v !== null)
			.slice(0, RECENT_MAX);
	} catch {
		return [];
	}
}

/** Put a colour first in the recent list; returns the new list. */
export function pushRecentColor(
	hex: string,
	storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): string[] {
	const norm = parseHex(hex);
	if (!norm) return readRecentColors(storage);
	const next = [
		norm,
		...readRecentColors(storage).filter((c) => c !== norm),
	].slice(0, RECENT_MAX);
	try {
		storage.setItem(RECENT_KEY, JSON.stringify(next));
	} catch {
		/* recents are a convenience only */
	}
	return next;
}

/** Fixed gradients and examples for the picker. They live here, not in a theme: they are the colour model itself. */
export const EXAMPLE_HEX = "#3b82f6";
export const HUE_GRADIENT =
	"linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)";
export const AREA_OVERLAY =
	"linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)";
export const hueColor = (h: number) => `hsl(${h} 100% 50%)`;
