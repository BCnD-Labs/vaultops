import { headerProps } from "../core/notes/properties";
import { createCanvas, createNote } from "../core/notes/repository";
import { type HealthEntry, scanVault } from "../core/notes/scan";
import { tagsOf } from "../core/notes/tags";
import type { PlannerTask } from "../core/planner/rules";
import { taskFromNote } from "../core/planner/task-note";
import { openVault, type VaultResult } from "../core/vault/vault";
import type { Host } from "../host/host";

export interface NoteRow {
	path: string;
	title: string;
	preview: string;
	readOnly: boolean;
	kind?: "note" | "canvas";
	/** Tags from the note's `tags` list property. */
	tags: string[];
	/** Set when the note is a planner task or event (and readable). */
	task?: PlannerTask;
}

/** Everything the window shows about the open vault. */
export interface VaultView {
	name: string | null;
	status: VaultResult["status"] | "none";
	/** True when notes may be created or saved. */
	writable: boolean;
	messages: string[];
	report: HealthEntry[];
	notes: NoteRow[];
	/** Every folder outside `.vaultops/`, empty ones included. */
	folders: string[];
}

/** Notes by title, ignoring case; the path settles ties. */
export function compareRows(
	a: Pick<NoteRow, "title" | "path">,
	b: Pick<NoteRow, "title" | "path">,
): number {
	return (
		a.title.toLowerCase().localeCompare(b.title.toLowerCase()) ||
		a.path.localeCompare(b.path)
	);
}

const EMPTY: VaultView = {
	name: null,
	status: "none",
	writable: false,
	messages: [],
	report: [],
	notes: [],
	folders: [],
};

const EXPLAIN: Partial<Record<VaultResult["status"], string>> = {
	"not-a-vault":
		"This folder already has files but isn't a vault. Choose an empty folder or an existing vault.",
	damaged: "This vault's settings are damaged, so it was not opened.",
	"read-only":
		"This vault was made by a newer version of the app. It's open read-only.",
};

/** Open (or create) the vault the host has selected, then list its notes. */
export async function loadVault(host: Host): Promise<VaultView> {
	const name = await host.currentVault();
	if (name === null) return EMPTY;
	const result = await openVault(host);
	const messages = [
		...(EXPLAIN[result.status] ? [EXPLAIN[result.status] as string] : []),
		...result.problems,
		...result.warnings,
	];
	if (result.status === "damaged" || result.status === "not-a-vault") {
		return {
			name,
			status: result.status,
			writable: false,
			messages,
			report: [],
			notes: [],
			folders: [],
		};
	}
	const { notes, report, folders } = await scanVault(host);
	const rows = notes
		.map((n) => ({
			path: n.path,
			title:
				typeof n.note.header.title === "string" ? n.note.header.title : n.path,
			readOnly: n.readOnly,
			kind: n.kind,
			preview: n.preview,
			tags: tagsOf(headerProps(n.note.header)),
			...(n.readOnly || n.kind === "canvas"
				? {}
				: (() => {
						const task = taskFromNote(n.path, n.note, n.preview);
						return task ? { task } : {};
					})()),
		}))
		.sort(compareRows);
	return {
		name,
		status: result.status,
		writable: result.status === "opened" || result.status === "created",
		messages,
		report,
		notes: rows,
		folders,
	};
}

/** Let the user pick a vault folder; null view change when cancelled. */
export async function chooseAndLoad(host: Host): Promise<VaultView | null> {
	const picked = await host.chooseVault();
	return picked === null ? null : loadVault(host);
}

/** Create an "Untitled" note in the vault root and reload the view. */
export async function newNote(host: Host, view: VaultView): Promise<VaultView> {
	if (!view.writable) return view;
	await createNote(host, "", "Untitled");
	return loadVault(host);
}

/** Like `newNote`, but also says which file was created so it can be opened. */
export async function createAndLoad(
	host: Host,
	view: VaultView,
	folder = "",
	title = "Untitled",
): Promise<{ view: VaultView; path: string | null }> {
	if (!view.writable) return { view, path: null };
	const { path } = await createNote(host, folder, title);
	return { view: await loadVault(host), path };
}

export async function createCanvasAndLoad(
	host: Host,
	view: VaultView,
	folder = "",
) {
	if (!view.writable) return { view, path: null };
	const { path } = await createCanvas(host, folder);
	return { view: await loadVault(host), path };
}
