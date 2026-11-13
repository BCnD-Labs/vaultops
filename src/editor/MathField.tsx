// Only types here; the library itself is loaded on first use (see loadMathLive).
import type { MathfieldElement } from "mathlive";
import { createElement, useEffect, useRef, useState } from "react";
// The fonts come from the app bundle, so nothing is fetched from anywhere else.
import "mathlive/fonts.css";

/**
 * The only place that knows about MathLive. A math block gives it LaTeX text
 * and gets LaTeX text back; swapping the library later means changing this
 * file. The LaTeX is only ever handed to the library as text.
 */

/** Longer than this is not drawn as an equation (it is kept, never cut). */
export const MATH_SHOW_LIMIT = 10000;

export type MathLeave = "before" | "after";

export interface MathFieldProps {
	/** The LaTeX source. */
	value: string;
	/** Shows the equation and does not let it be edited. */
	readOnly: boolean;
	onChange: (latex: string) => void;
	/** Arrow keys, Tab or Escape took the caret out of the equation. */
	onLeave: (where: MathLeave) => void;
	/** Backspace or Delete was pressed with the equation empty. */
	onEmptyDelete: () => void;
	/** Take the caret into the equation (set once when it becomes true). */
	focused?: boolean;
	label?: string;
}

type MathLive = typeof import("mathlive");
let loading: Promise<MathLive> | null = null;

/**
 * Load MathLive once, and turn off everything that could go to the network or
 * make noise: its fonts come from the app bundle (editor.css imports them),
 * and no sounds are used. It has no compute engine, so it only edits, never
 * calculates.
 */
function loadMathLive(): Promise<MathLive> {
	loading ??= import("mathlive").then((lib) => {
		const field = lib.MathfieldElement;
		// Outside a browser (a server build) there is no editor to set up.
		if (!field) throw new Error("MathLive has no editor here");
		field.fontsDirectory = null;
		field.soundsDirectory = null;
		field.keypressSound = null;
		field.plonkSound = null;
		field.computeEngine = null;
		return lib;
	});
	loading.catch(() => {
		loading = null;
	});
	return loading;
}

export function MathField({
	value,
	readOnly,
	onChange,
	onLeave,
	onEmptyDelete,
	focused,
	label = "Equation",
}: MathFieldProps) {
	const [ready, setReady] = useState(false);
	const element = useRef<MathfieldElement | null>(null);
	const handlers = useRef({ onChange, onLeave, onEmptyDelete });
	handlers.current = { onChange, onLeave, onEmptyDelete };
	const tooLong = value.length > MATH_SHOW_LIMIT;

	useEffect(() => {
		if (tooLong) return;
		let live = true;
		// If the library can't load, the equation stays shown as its LaTeX text.
		loadMathLive().then(
			() => live && setReady(true),
			() => {},
		);
		return () => {
			live = false;
		};
	}, [tooLong]);

	// Hand the library its settings and listen to it. The element is made by React
	// and found again by its ref once the library has defined it.
	useEffect(() => {
		const el = element.current;
		if (!ready || !el) return;
		el.mathVirtualKeyboardPolicy = "auto";
		const input = () => handlers.current.onChange(el.value);
		const keydown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				handlers.current.onLeave("after");
			} else if (
				(event.key === "Backspace" || event.key === "Delete") &&
				el.value === ""
			) {
				event.preventDefault();
				handlers.current.onEmptyDelete();
			}
		};
		const moveOut = (event: Event) => {
			const direction = (event as CustomEvent<{ direction: string }>).detail
				?.direction;
			event.preventDefault();
			handlers.current.onLeave(
				direction === "backward" || direction === "upward" ? "before" : "after",
			);
		};
		el.addEventListener("input", input);
		el.addEventListener("keydown", keydown);
		el.addEventListener("move-out", moveOut);
		return () => {
			el.removeEventListener("input", input);
			el.removeEventListener("keydown", keydown);
			el.removeEventListener("move-out", moveOut);
		};
	}, [ready]);

	// The note's value flows into the field (the first time, and after undo, redo
	// or a change from elsewhere). It is checked on every render, because renders
	// can be merged. A field being typed in is never overwritten: what it holds is
	// the newer value, and the note catches up with it.
	useEffect(() => {
		const el = element.current;
		if (!ready || !el || el.value === value) return;
		if (el.ownerDocument.activeElement === el) return;
		el.value = value;
	});

	useEffect(() => {
		const el = element.current;
		if (ready && el) el.readOnly = readOnly;
	}, [ready, readOnly]);

	useEffect(() => {
		const el = element.current;
		if (ready && el && focused && !readOnly) el.focus();
	}, [ready, focused, readOnly]);

	if (tooLong) {
		return (
			<div className="math-source" role="img" aria-label={label}>
				<code>{value.slice(0, 200)}</code>
				<span className="math-note">
					Too long to show as an equation here. It is kept as written.
				</span>
			</div>
		);
	}
	if (!ready) {
		return (
			<div className="math-source" role="img" aria-label={label}>
				<code>{value}</code>
			</div>
		);
	}
	return createElement("math-field", {
		ref: element,
		class: "math-field",
		"aria-label": label,
		"read-only": readOnly ? "" : undefined,
	});
}
