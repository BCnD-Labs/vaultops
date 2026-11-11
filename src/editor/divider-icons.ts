import { createLucideIcon, Minus } from "lucide-react";

/** Slash-menu icons that show how each divider style looks. */
export const DIVIDER_ICONS = {
	solid: Minus,
	dashed: createLucideIcon("DividerDashed", [
		["path", { d: "M3 12h4", key: "p1" }],
		["path", { d: "M10 12h4", key: "p2" }],
		["path", { d: "M17 12h4", key: "p3" }],
	]),
	dotted: createLucideIcon("DividerDotted", [
		["path", { d: "M4 12h.01", key: "p4" }],
		["path", { d: "M9 12h.01", key: "p5" }],
		["path", { d: "M14 12h.01", key: "p6" }],
		["path", { d: "M19 12h.01", key: "p7" }],
	]),
	thick: createLucideIcon("DividerThick", [
		["path", { d: "M3 12h18", strokeWidth: 4, key: "p8" }],
	]),
} as const;
