import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NoteListRow } from "./NoteListRow";
import { noteSort } from "./note-sort";

afterEach(() => vi.unstubAllGlobals());
it("renders the selected row with preview, two tag chips, overflow and read-only status", () => {
	const html = renderToStaticMarkup(
		<NoteListRow
			note={{
				path: "n.vnote",
				title: "Title",
				preview: "Body text",
				tags: ["one", "two", "three"],
				readOnly: true,
			}}
			current
			locked={false}
			onOpen={() => {}}
		/>,
	);
	for (const text of [
		'aria-current="true"',
		'draggable="true"',
		"Title",
		"Body text",
		'class="note-tag-chip"',
		"#one",
		"#two",
		"+1",
		"read-only",
	])
		expect(html).toContain(text);
	expect(html).not.toContain("#three");
});
it("remembers valid sort choices and tolerates invalid or unavailable storage", () => {
	const setItem = vi.fn();
	vi.stubGlobal("localStorage", { getItem: () => "invalid", setItem });
	expect(noteSort()).toBe("name-asc");
	expect(noteSort("name-desc")).toBe("name-desc");
	expect(setItem).toHaveBeenCalledWith("vaultops:note-sort", "name-desc");
	vi.stubGlobal("localStorage", { getItem: () => "name-desc" });
	expect(noteSort()).toBe("name-desc");
	vi.stubGlobal("localStorage", {
		getItem: () => {
			throw new Error("unavailable");
		},
	});
	expect(noteSort()).toBe("name-asc");
	expect(noteSort("name-desc")).toBe("name-desc");
});
