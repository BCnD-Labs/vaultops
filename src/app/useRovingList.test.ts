// @vitest-environment happy-dom
import { renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { nextRovingKey, useRovingList } from "./useRovingList";

afterEach(() => {
	document.body.replaceChildren();
});

const keys = ["a", "b", "c"];

it("moves down and up, and wraps at the ends like the tab strip", () => {
	expect(nextRovingKey(keys, "a", "ArrowDown")).toBe("b");
	expect(nextRovingKey(keys, "b", "ArrowUp")).toBe("a");
	expect(nextRovingKey(keys, "c", "ArrowDown")).toBe("a");
	expect(nextRovingKey(keys, "a", "ArrowUp")).toBe("c");
});

it("jumps to the first and last with Home and End, and ignores other keys", () => {
	expect(nextRovingKey(keys, "b", "Home")).toBe("a");
	expect(nextRovingKey(keys, "b", "End")).toBe("c");
	expect(nextRovingKey(keys, "b", "Enter")).toBeNull();
	expect(nextRovingKey(keys, "b", " ")).toBeNull();
	expect(nextRovingKey(keys, "gone", "ArrowDown")).toBeNull();
	expect(nextRovingKey([], "a", "ArrowDown")).toBeNull();
});

function rows() {
	const root = document.createElement("div");
	document.body.append(root);
	const nodes = keys.map((key) => {
		const node = document.createElement("button");
		node.dataset.roving = key;
		root.append(node);
		return node;
	});
	const input = document.createElement("input");
	root.append(input);
	return { root, nodes, input };
}

const press = (target: HTMLElement, key: string) => {
	const preventDefault = vi.fn();
	const event = {
		target,
		key,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		preventDefault,
	} as unknown as KeyboardEvent<HTMLElement>;
	return { event, preventDefault };
};

it("makes the selected row the one Tab stop, else the first", () => {
	const selected = renderHook(() => useRovingList(keys, "b")).result.current;
	expect(keys.map((k) => selected.itemProps(k).tabIndex)).toEqual([-1, 0, -1]);
	const none = renderHook(() => useRovingList(keys, null)).result.current;
	expect(keys.map((k) => none.itemProps(k).tabIndex)).toEqual([0, -1, -1]);
	const gone = renderHook(() => useRovingList(keys, "zzz")).result.current;
	expect(gone.tabbable).toBe("a");
});

it("moves focus with the arrow keys, only from a row", () => {
	const { root, nodes, input } = rows();
	const { result } = renderHook(() => useRovingList(keys, null));
	result.current.rootRef.current = root;
	const down = press(nodes[0] as HTMLElement, "ArrowDown");
	result.current.onKeyDown(down.event);
	expect(document.activeElement).toBe(nodes[1]);
	expect(down.preventDefault).toHaveBeenCalled();
	result.current.onKeyDown(press(nodes[1] as HTMLElement, "End").event);
	expect(document.activeElement).toBe(nodes[2]);
	result.current.onKeyDown(press(nodes[2] as HTMLElement, "Home").event);
	expect(document.activeElement).toBe(nodes[0]);
	const typed = press(input, "ArrowDown");
	result.current.onKeyDown(typed.event);
	expect(typed.preventDefault).not.toHaveBeenCalled();
	expect(document.activeElement).toBe(nodes[0]);
});

it("lets onKey take a key first", () => {
	const { root, nodes } = rows();
	const onKey = vi.fn(() => true);
	const { result } = renderHook(() => useRovingList(keys, null, onKey));
	result.current.rootRef.current = root;
	const right = press(nodes[0] as HTMLElement, "ArrowRight");
	result.current.onKeyDown(right.event);
	expect(onKey).toHaveBeenCalledWith(right.event, "a");
	expect(right.preventDefault).toHaveBeenCalled();
});
