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

/** Every error code; the Rust side uses the same list (test-fixtures/host-error-codes.json). */
export const HOST_ERROR_CODES = [
	"not-found",
	"already-exists",
	"not-a-folder",
	"is-a-folder",
	"invalid-path",
	"io",
] as const;

export type HostErrorCode = (typeof HOST_ERROR_CODES)[number];

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

	/**
	 * Let the user choose the vault folder with the system picker and make it
	 * the open vault. Resolves to the folder's name, or null if cancelled
	 * (then nothing changes). The folder's location never leaves the host.
	 */
	chooseVault(): Promise<string | null>;

	/** The open vault's folder name, or null when none is open. */
	currentVault(): Promise<string | null>;

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

	/**
	 * Run `handler` (and wait for it) when the window is asked to close. It
	 * resolves true to let the window close, false to keep it open. Resolves to
	 * a function that removes the handler; rejects if the shell could not
	 * register it, so the app can warn that saving on quit is unavailable.
	 */
	onCloseRequested(handler: () => Promise<boolean>): Promise<() => void>;

	/**
	 * Append lines to the app's own log file (kept in the app's log folder, never
	 * in a vault). Best effort: callers must not depend on it succeeding.
	 */
	appendLog(lines: string): Promise<void>;

	/**
	 * The app's own small files, kept outside any vault (settings folder). Only
	 * the names in `APP_FILE_NAMES` work. Reads resolve to null when the file
	 * doesn't exist yet; writes are atomic.
	 */
	readAppFile(name: AppFileName): Promise<string | null>;
	writeAppFile(name: AppFileName, text: string): Promise<void>;

	/** The last lines of the app's log file ("" when there is none yet). */
	readLogTail(maxLines: number): Promise<string>;
}

/** Same list as `ALLOWED` in src-tauri/src/app_files.rs. */
export const APP_FILE_NAMES = ["session.json", "crash-report.txt"] as const;
export type AppFileName = (typeof APP_FILE_NAMES)[number];
