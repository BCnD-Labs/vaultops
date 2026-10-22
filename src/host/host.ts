/**
 * The only door between app code and the operating system.
 * Every native call (files, git, dialogs, watching) goes through this
 * interface, so the desktop shell can be swapped and tests can use a fake.
 *
 * Paths are vault-relative strings (see src/core/vault-path). The host knows
 * the vault root; app code never sees or sends absolute paths.
 */
export interface AppInfo {
	name: string;
	version: string;
}

export type EntryKind = "file" | "folder";

export interface DirEntry {
	name: string;
	kind: EntryKind;
}

export type HostErrorCode =
	| "not-found"
	| "already-exists"
	| "not-a-folder"
	| "is-a-folder"
	| "invalid-path"
	| "io";

/** Errors carry a code and a short message, never an absolute path. */
export class HostError extends Error {
	readonly code: HostErrorCode;
	constructor(code: HostErrorCode, message: string) {
		super(message);
		this.name = "HostError";
		this.code = code;
	}
}

export interface Host {
	appInfo(): Promise<AppInfo>;

	/** Read a UTF-8 text file. */
	readText(path: string): Promise<string>;

	/**
	 * Replace or create a file atomically: readers see the old content or the
	 * new content, never a partial file. The parent folder must exist.
	 */
	writeTextAtomic(path: string, text: string): Promise<void>;

	/**
	 * Move or rename a file or folder. Fails with `already-exists` if the
	 * target exists, except for a rename that only changes capital letters
	 * or Unicode form of the same entry.
	 */
	move(from: string, to: string): Promise<void>;

	/** List a folder ("" is the vault root), sorted by name. */
	list(folder: string): Promise<DirEntry[]>;

	/** Create a folder and any missing parents. An existing folder is fine. */
	makeFolder(path: string): Promise<void>;

	/** What is at a path, or null if nothing is. */
	kindOf(path: string): Promise<EntryKind | null>;
}
