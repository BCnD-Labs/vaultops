import { createNote } from "../core/notes/repository";
import { scanVault } from "../core/notes/scan";
import { openVault, type VaultResult } from "../core/vault/vault";
import type { Host } from "../host/host";

export interface NoteRow {
	path: string;
	title: string;
	readOnly: boolean;
}

/** Everything the window shows about the open vault. */
export interface VaultView {
	name: string | null;
	status: VaultResult["status"] | "none";
	/** True when notes may be created or saved. */
	writable: boolean;
	messages: string[];
	notes: NoteRow[];
}

/** Notes by title, ignoring case; the path settles ties. */
export function compareRows(a: NoteRow, b: NoteRow): number {
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
	notes: [],
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
			notes: [],
		};
	}
	const { notes, report } = await scanVault(host);
	for (const entry of report) {
		if (entry.group !== "good" || entry.duplicateOf.length > 0) {
			messages.push(`${entry.path}: ${entry.reason}`);
		}
	}
	const rows = notes
		.map((n) => ({
			path: n.path,
			title:
				typeof n.note.header.title === "string" ? n.note.header.title : n.path,
			readOnly: n.readOnly,
		}))
		.sort(compareRows);
	return {
		name,
		status: result.status,
		writable: result.status === "opened" || result.status === "created",
		messages,
		notes: rows,
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
): Promise<{ view: VaultView; path: string | null }> {
	if (!view.writable) return { view, path: null };
	const { path } = await createNote(host, "", "Untitled");
	return { view: await loadVault(host), path };
}
