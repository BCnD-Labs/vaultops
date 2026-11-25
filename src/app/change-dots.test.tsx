// @vitest-environment happy-dom
import {
	act,
	cleanup,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { buildTree } from "../core/notes/tree";
import { MemoryHost } from "../host/memory-host";
import {
	ChangedPaths,
	DOTS_DELAY_MS,
	hasChange,
	historyChanged,
	useChangedPaths,
} from "./change-dots";
import { NoteTree } from "./NoteTree";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

it("finds changes in a note or anywhere inside a folder", () => {
	const changed = new Set(["Class/Week 1/C.vnote"]);
	expect(hasChange(changed, "Class/Week 1/C.vnote", false)).toBe(true);
	expect(hasChange(changed, "Class", true)).toBe(true);
	expect(hasChange(changed, "Class/Week 1", true)).toBe(true);
	expect(hasChange(changed, "Clas", true)).toBe(false);
	expect(hasChange(changed, "Home.vnote", false)).toBe(false);
});

it("shows dots on changed notes and the folders holding them", () => {
	const nodes = buildTree(
		["Class"],
		[
			{ path: "Home.vnote", title: "Home", readOnly: false },
			{ path: "Class/A.vnote", title: "Note A", readOnly: false },
		],
	);
	render(
		<TooltipProvider>
			<ChangedPaths.Provider value={new Set(["Class/A.vnote"])}>
				<NoteTree
					nodes={nodes}
					livePath="Class/A.vnote"
					onOpen={vi.fn()}
					actions={{
						createFolder: vi.fn(),
						renameFolder: vi.fn(),
						deleteFolder: vi.fn(),
						deleteNote: vi.fn(),
						move: vi.fn(),
					}}
					busy={false}
				/>
			</ChangedPaths.Provider>
		</TooltipProvider>,
	);
	expect(
		screen.getByRole("img", { name: "changed since the last save point" }),
	).toBeTruthy();
	expect(
		screen.getByRole("img", { name: "has changes since the last save point" }),
	).toBeTruthy();
	expect(
		screen.getAllByRole("img", { name: /since the last save point/ }),
	).toHaveLength(2);
});

it("reads changes a moment after saves and on focus, and clears them after a save point", async () => {
	vi.useFakeTimers();
	const host = new MemoryHost();
	await host.writeTextAtomic("a.vnote", "1");
	await host.vcs.enable("Sam");
	await host.writeTextAtomic("a.vnote", "2");
	const { result, rerender } = renderHook(
		({ key }) => useChangedPaths(host, key),
		{
			initialProps: { key: 1 },
		},
	);
	expect([...result.current]).toEqual([]);
	await act(async () => {
		await vi.advanceTimersByTimeAsync(DOTS_DELAY_MS);
	});
	expect([...result.current]).toEqual(["a.vnote"]);
	await host.vcs.savePoint("saved");
	await act(async () => {
		historyChanged();
		await vi.advanceTimersByTimeAsync(0);
	});
	expect([...result.current]).toEqual([]);
	await host.writeTextAtomic("a.vnote", "2b");
	await act(async () => {
		window.dispatchEvent(new Event("focus"));
		await vi.advanceTimersByTimeAsync(0);
	});
	expect([...result.current]).toEqual(["a.vnote"]);
	await host.vcs.savePoint("again");
	await host.writeTextAtomic("a.vnote", "3");
	rerender({ key: 2 });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(DOTS_DELAY_MS);
	});
	expect([...result.current]).toEqual(["a.vnote"]);
});
