// @vitest-environment happy-dom
import type { SuggestionProps } from "@tiptap/suggestion";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SLASH_ITEMS, type SlashItem } from "./slash-items";
import { createPopup } from "./slash-menu";

afterEach(() => {
	document.body.replaceChildren();
});

const pick = (...ids: string[]) =>
	ids.map((id) => SLASH_ITEMS.find((i) => i.id === id) as SlashItem);
const rect = (over: Partial<DOMRect> = {}) =>
	({ left: 100, top: 100, bottom: 120, ...over }) as DOMRect;

function props(
	items: SlashItem[],
	command = vi.fn(),
	clientRect: (() => DOMRect | null) | null = () => rect(),
) {
	return {
		items,
		command,
		clientRect,
	} as unknown as SuggestionProps<SlashItem>;
}
const root = () => document.querySelector(".slash-menu") as HTMLElement;
const rows = () => [
	...root().querySelectorAll<HTMLElement>(".slash-menu-item"),
];
const selectedId = () =>
	rows().find((r) => r.getAttribute("aria-selected") === "true")?.dataset.id;
const key = (name: string) => new KeyboardEvent("keydown", { key: name });

describe("slash popup rendering", () => {
	it("mounts a listbox on the page and removes it on destroy", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph", "heading1")));
		expect(root().getAttribute("role")).toBe("listbox");
		expect(document.body.contains(root())).toBe(true);
		popup.destroy();
		expect(document.querySelector(".slash-menu")).toBeNull();
	});

	it("shows one heading per section, in order, with an icon and label per row", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph", "heading1", "bullet", "table")));
		const headings = [...root().querySelectorAll(".slash-menu-section")].map(
			(h) => h.textContent,
		);
		expect(headings).toEqual(["Blocks", "Lists", "Insert"]);
		expect(
			rows().map((r) => r.querySelector(".slash-menu-label")?.textContent),
		).toEqual(["Text", "Heading 1", "Bulleted list", "Table"]);
		for (const row of rows()) {
			expect(row.querySelector(".slash-menu-icon svg")).toBeTruthy();
			expect(row.getAttribute("role")).toBe("option");
		}
	});

	it("shows the typed-shortcut hint only for items that have one", () => {
		const popup = createPopup();
		const withHint = SLASH_ITEMS.find((i) => i.hint) as SlashItem;
		const without = SLASH_ITEMS.find((i) => !i.hint) as SlashItem;
		popup.mount(props([withHint, without]));
		const hints = rows().map(
			(r) => r.querySelector(".slash-menu-hint")?.textContent,
		);
		expect(hints).toEqual([withHint.hint, undefined]);
	});

	it("says 'No matches' for an empty list", () => {
		const popup = createPopup();
		popup.mount(props([]));
		expect(root().querySelector(".slash-menu-empty")?.textContent).toBe(
			"No matches",
		);
		expect(rows()).toHaveLength(0);
	});

	it("repaints with the new items on update and keeps the selection in range", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph", "heading1", "heading2")));
		popup.key(key("ArrowDown"));
		popup.key(key("ArrowDown"));
		expect(selectedId()).toBe("heading2");
		popup.update(props(pick("paragraph", "heading1")));
		expect(rows()).toHaveLength(2);
		expect(selectedId()).toBe("heading1");
	});

	it("mount starts from the first item even after an earlier menu moved down", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph", "heading1")));
		popup.key(key("ArrowDown"));
		popup.mount(props(pick("paragraph", "heading1")));
		expect(selectedId()).toBe("paragraph");
	});
});

describe("slash popup keys", () => {
	it("ArrowDown and ArrowUp move and wrap around", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph", "heading1", "heading2")));
		expect(popup.key(key("ArrowUp"))).toBe(true);
		expect(selectedId()).toBe("heading2");
		expect(popup.key(key("ArrowDown"))).toBe(true);
		expect(selectedId()).toBe("paragraph");
		popup.key(key("ArrowDown"));
		expect(selectedId()).toBe("heading1");
	});

	it("Enter chooses the highlighted item", () => {
		const command = vi.fn();
		const popup = createPopup();
		const items = pick("paragraph", "heading1");
		popup.mount(props(items, command));
		popup.key(key("ArrowDown"));
		expect(popup.key(key("Enter"))).toBe(true);
		expect(command).toHaveBeenCalledWith(items[1]);
	});

	it("leaves other keys to the editor", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph")));
		expect(popup.key(key("a"))).toBe(false);
		expect(popup.key(key("Escape"))).toBe(false);
	});

	it("with no matches it lets every key through, including Enter", () => {
		const command = vi.fn();
		const popup = createPopup();
		popup.mount(props([], command));
		expect(popup.key(key("Enter"))).toBe(false);
		expect(popup.key(key("ArrowDown"))).toBe(false);
		expect(command).not.toHaveBeenCalled();
	});

	it("choosing with the mouse does not steal focus from the editor", () => {
		const command = vi.fn();
		const popup = createPopup();
		const items = pick("paragraph", "heading1");
		popup.mount(props(items, command));
		const event = new MouseEvent("mousedown", {
			bubbles: true,
			cancelable: true,
		});
		rows()[1]?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(true);
		expect(command).toHaveBeenCalledWith(items[1]);
	});

	it("uses the newest command after an update", () => {
		const first = vi.fn();
		const second = vi.fn();
		const popup = createPopup();
		const items = pick("paragraph");
		popup.mount(props(items, first));
		popup.update(props(items, second));
		popup.key(key("Enter"));
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledWith(items[0]);
	});
});

describe("slash popup placement", () => {
	it("opens below the caret by default", () => {
		const popup = createPopup();
		popup.mount(
			props(pick("paragraph"), vi.fn(), () =>
				rect({ left: 50, top: 100, bottom: 120 }),
			),
		);
		expect(root().dataset.side).toBe("below");
		expect(root().style.left).toBe("50px");
		expect(root().style.top).toBe("124px");
		expect(root().style.bottom).toBe("");
	});

	it("opens above the caret near the bottom of the window", () => {
		const popup = createPopup();
		const h = window.innerHeight;
		popup.mount(
			props(pick("paragraph"), vi.fn(), () =>
				rect({ top: h - 30, bottom: h - 10 }),
			),
		);
		// happy-dom has no layout, so the menu measures 0 high and fits below;
		// give it height for this case.
		Object.defineProperty(root(), "offsetHeight", {
			configurable: true,
			value: 600,
		});
		popup.update(
			props(pick("paragraph"), vi.fn(), () =>
				rect({ top: h - 30, bottom: h - 10 }),
			),
		);
		expect(root().dataset.side).toBe("above");
		expect(root().style.top).toBe("");
		expect(root().style.bottom).toBe(`${h - (h - 30) + 4}px`);
	});

	it("caps the height at the room available or the menu's own limit", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph")));
		expect(root().style.maxHeight).toContain("var(--slash-menu-max-height)");
	});

	it("does not move when the caret has no rectangle", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph"), vi.fn(), () => null));
		expect(root().dataset.side).toBeUndefined();
		expect(root().style.top).toBe("");
	});

	it("does not move when there is no clientRect function", () => {
		const popup = createPopup();
		popup.mount(props(pick("paragraph"), vi.fn(), null));
		expect(root().dataset.side).toBeUndefined();
	});
});
