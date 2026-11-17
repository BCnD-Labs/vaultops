import { type KeyboardEvent, useEffect, useRef, useState } from "react";

/**
 * Where an arrow or Home/End key moves focus in a vertical list. Wraps at the
 * ends, like the tab strip (src/app/TabBar.tsx). Returns null for any other key.
 */
export function nextRovingKey(
	keys: readonly string[],
	from: string,
	pressed: string,
): string | null {
	const index = keys.indexOf(from);
	if (index < 0 || keys.length === 0) return null;
	if (pressed === "Home") return keys[0] ?? null;
	if (pressed === "End") return keys[keys.length - 1] ?? null;
	if (pressed === "ArrowDown") return keys[(index + 1) % keys.length] ?? null;
	if (pressed === "ArrowUp")
		return keys[(index - 1 + keys.length) % keys.length] ?? null;
	return null;
}

const SELECTOR = "[data-roving]";

/**
 * One Tab stop for a list of rows, with arrow keys inside it. Spread
 * `itemProps(key)` on each focusable row and `onKeyDown` + `rootRef` on the
 * list. Moving focus never changes selection; Enter and Space still press the
 * row's own button. Only keys pressed on a row itself are handled, so search
 * boxes, dialogs and the embedded editor keep their keys.
 *
 * `onKey` gets first refusal on a row's key press (a tree uses it for Left
 * and Right, and the context-menu key); return true when it handled the key.
 */
export function useRovingList(
	keys: readonly string[],
	active: string | null,
	onKey?: (event: KeyboardEvent<HTMLElement>, key: string) => boolean,
) {
	const rootRef = useRef<HTMLElement | null>(null);
	const [focused, setFocused] = useState<string | null>(null);
	const pending = useRef<string | null>(null);
	const [, bump] = useState(0);
	const tabbable =
		focused !== null && keys.includes(focused)
			? focused
			: active !== null && keys.includes(active)
				? active
				: (keys[0] ?? null);

	const rowOf = (key: string) =>
		Array.from(
			rootRef.current?.querySelectorAll<HTMLElement>(SELECTOR) ?? [],
		).find((node) => node.dataset.roving === key);

	const focusKey = (key: string) => {
		const node = rowOf(key);
		if (!node) return false;
		node.focus();
		return true;
	};

	/**
	 * Focus this row once it is on screen (after a delete, rename or duplicate
	 * re-draws the list). A closing dialog hands focus back to what opened it,
	 * so the move is repeated if that lands outside a row.
	 */
	const requestFocus = (key: string | null) => {
		pending.current = key;
		bump((n) => n + 1);
		// A row that never appears must not grab focus from a later draw.
		setTimeout(() => {
			if (pending.current === key) pending.current = null;
		}, 2000);
	};

	// The retries outlive re-draws (a closing dialog re-renders the list), so
	// they live in a ref and are only cleared on unmount or a newer request.
	const retries = useRef<ReturnType<typeof setTimeout>[]>([]);
	useEffect(
		() => () => {
			for (const timer of retries.current) clearTimeout(timer);
		},
		[],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs after every draw until the wanted row exists
	useEffect(() => {
		const key = pending.current;
		if (key === null || !focusKey(key)) return;
		pending.current = null;
		for (const timer of retries.current) clearTimeout(timer);
		retries.current = [0, 250].map((ms) =>
			setTimeout(() => {
				const now = document.activeElement;
				const onRow = now instanceof HTMLElement && now.matches(SELECTOR);
				// Focus fell to the page, into the list, or onto the dialog around it.
				const ours =
					now === document.body ||
					(now &&
						rootRef.current &&
						(rootRef.current.contains(now) || now.contains(rootRef.current)));
				if (!onRow && ours) focusKey(key);
			}, ms),
		);
	});

	const itemProps = (key: string) => ({
		"data-roving": key,
		tabIndex: key === tabbable ? 0 : -1,
		onFocus: () => setFocused(key),
	});

	const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		const row = event.target;
		if (!(row instanceof HTMLElement) || !row.matches(SELECTOR)) return;
		const key = row.dataset.roving ?? "";
		// `onKey` sees every press on a row, so it checks modifiers itself.
		if (onKey?.(event, key)) {
			event.preventDefault();
			return;
		}
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
			return;
		const next = nextRovingKey(keys, key, event.key);
		if (next === null) return;
		event.preventDefault();
		focusKey(next);
	};

	return { rootRef, itemProps, onKeyDown, focusKey, requestFocus, tabbable };
}
