import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { createNote } from "../core/notes/repository";
import {
	deleteForever,
	listTrash,
	restoreNote,
	trashNote,
} from "../core/notes/trash";
import { MemoryHost } from "../host/memory-host";
import { HealthScreen, healthCount, healthLabel } from "./HealthScreen";
import { loadVault } from "./session";
import { TrashScreen } from "./TrashScreen";

it("groups every unhealthy file and counts each file once", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	const a = await createNote(host, "", "Original");
	const text = await host.readText(a.path);
	await host.writeTextAtomic("Copy.vnote", text);
	await host.writeTextAtomic("Broken.vnote", "bad");
	await host.writeTextAtomic(
		"Truncated.vnote",
		`${text.replace(a.note.header.noteId, "truncated")}bad\n`,
	);
	await host.writeTextAtomic(
		"Newer.vnote",
		text.replace(a.note.header.noteId, "newer").replace('"v":1', '"v":2'),
	);
	const { report } = await loadVault(host);
	const out = renderToStaticMarkup(
		createElement(HealthScreen, { report, onOpen: () => {} }),
	);
	for (const heading of [
		"Could not be read",
		"Partly unreadable (truncated)",
		"Written by a newer version",
		"Same note id as another file",
	])
		expect(out).toContain(heading);
	for (const e of report) {
		expect(out).toContain(e.path);
		expect(out).toContain(e.reason);
	}
	expect(healthCount(report)).toBe(5);
	expect(healthLabel(report)).toBe("Health (5)");
	expect(healthLabel([])).toBe("Health");
	expect(
		renderToStaticMarkup(
			createElement(HealthScreen, { report: [], onOpen: () => {} }),
		),
	).toContain("Every note loaded fine.");
});

// Inspect the presentational component's buttons to exercise the inline confirmation.
function button(
	node: ReactElement,
	label: string,
): { onClick: () => Promise<void> | void } {
	const props = node.props as { children?: unknown };
	if (props.children === label) return node.props as ReturnType<typeof button>;
	for (const child of [props.children].flat(Infinity)) {
		if (child && typeof child === "object" && "props" in child) {
			try {
				return button(child as ReactElement, label);
			} catch {
				/* next child */
			}
		}
	}
	throw new Error(`Missing button ${label}`);
}

it("lists newest first, restores the original path, and deletes only after confirmation", async () => {
	const host = new MemoryHost();
	await loadVault(host);
	await host.makeFolder("Class");
	for (const day of [1, 2]) {
		const note = await createNote(host, "Class", `Note ${day}`);
		await trashNote(host, note.path, new Date(`2026-10-0${day}T10:00:00Z`));
	}
	let entries = await listTrash(host);
	let confirming: string | null = null;
	const remove = vi.fn(async (path: string) => {
		await deleteForever(host, path);
	});
	const props = () => ({
		entries,
		disabled: false,
		confirming,
		onConfirm: (p: string | null) => {
			confirming = p;
		},
		onDelete: remove,
		onRestore: async (p: string) => {
			await restoreNote(host, p);
		},
	});
	const html = renderToStaticMarkup(createElement(TrashScreen, props()));
	expect(html.indexOf("Class/Note 2.vnote")).toBeLessThan(
		html.indexOf("Class/Note 1.vnote"),
	);
	expect(html).toContain(entries[0]?.deletedAt?.toLocaleString());
	await button(TrashScreen(props()), "Delete forever").onClick();
	expect(remove).not.toHaveBeenCalled();
	await button(TrashScreen(props()), "Cancel").onClick();
	expect(await listTrash(host)).toEqual(entries);
	await button(TrashScreen(props()), "Restore").onClick();
	expect(await host.kindOf("Class/Note 2.vnote")).toBe("file");
	entries = await listTrash(host);
	await button(TrashScreen(props()), "Delete forever").onClick();
	await button(TrashScreen(props()), "Delete forever").onClick();
	expect(await listTrash(host)).toEqual([]);
	const locked = renderToStaticMarkup(
		createElement(TrashScreen, {
			...props(),
			disabled: true,
			confirming: null,
		}),
	);
	expect(locked.match(/disabled=""/g)).toHaveLength(2);
	expect(
		renderToStaticMarkup(
			createElement(TrashScreen, { ...props(), entries: [] }),
		),
	).toContain("The trash is empty.");
});
