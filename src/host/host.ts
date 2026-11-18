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

/** STOPGAP(update-script): where the maintainer's install script stands. */
export type UpdateScriptState = "idle" | "running" | "finished" | "failed";

export interface UpdateScriptStatus {
	state: UpdateScriptState;
	/** The script's latest line of output ("" before it says anything). */
	lastLine: string;
}

/** STOPGAP(update-script): which branch and commit this app was built from ("unknown" for a build not made by the install script). */
export interface BuildInfo {
	branch: string;
	/** Full commit id. */
	commit: string;
	/** ISO time of the build. */
	builtAt: string;
}

/** STOPGAP(update-script): the latest commit of one branch on GitHub. */
export interface UpdateChannel {
	/** False when the branch is not on GitHub (yet); the rest is then empty. */
	exists: boolean;
	commit: string;
	shortCommit: string;
	/** ISO time of the commit. */
	committedAt: string;
	subject: string;
}

/** The only two branches the updater can install, matching the Rust allowlist. */
export type UpdateChannelName = "main" | "develop";

export interface UpdateChannels {
	main: UpdateChannel;
	develop: UpdateChannel;
	/** Set when the check could not reach GitHub; the commits are then the ones fetched last time. */
	error: string | null;
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
	/** Read an image under attachments/ as bytes. */
	readCover(path: string): Promise<ArrayBuffer>;
	/** Pick and import an image, or return null when cancelled. */
	chooseCover(): Promise<string | null>;

	/**
	 * The vault's cache, `.vaultops/cache/` (display copies of images and the
	 * like): safe to delete, made again on demand. `path` is relative to that
	 * folder and must pass `isCachePath`. `readCache` resolves to null when
	 * nothing is cached there. `writeCache` replaces the file atomically,
	 * creates missing folders and refuses more than `MAX_CACHE_BYTES`.
	 */
	readCache(path: string): Promise<ArrayBuffer | null>;
	writeCache(path: string, bytes: ArrayBuffer): Promise<void>;

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
	 * Delete one note forever, then any folders it leaves empty (never
	 * `.vaultops/trash` itself). The only call that erases a note, so it is narrow:
	 * it works only on a file inside a time folder of `.vaultops/trash/`, spelled
	 * exactly so, and refuses (`invalid-path`) everything else, including a path
	 * reached through a symlink. A folder fails with `is-a-folder`, a missing
	 * note with `not-found`.
	 */
	removeTrashed(path: string): Promise<void>;

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

	/**
	 * The maintainer's reports folder: a folder chosen with the system picker
	 * where report files are dropped so they can be read outside the app. The
	 * folder's location never leaves the host. `chooseReportsFolder` resolves to
	 * the folder's name, or null if cancelled; `reportsFolder` to the current
	 * folder's name, or null when none is chosen (or it has gone). `writeReport`
	 * writes a plain `.txt` file (letters, digits, - _ . only) and fails when no
	 * folder is chosen.
	 */
	chooseReportsFolder(): Promise<string | null>;
	reportsFolder(): Promise<string | null>;
	writeReport(name: string, text: string): Promise<void>;

	/**
	 * STOPGAP(update-script): run the maintainer's install script (check out and
	 * pull the newest `channel`, build, install, reopen) from the code folder this
	 * app was built from. The window sends only the channel, which the host checks
	 * against the same two fixed names; which script runs is decided by the host.
	 * Fails with `io` while a run is going, `not-found` when the script is missing
	 * and `invalid-path` for any other channel. `updateScriptStatus` is read-only
	 * and safe to poll.
	 */
	startUpdateScript(channel: UpdateChannelName): Promise<void>;
	updateScriptStatus(): Promise<UpdateScriptStatus>;
	/** STOPGAP(update-script): the branch and commit this app was built from. */
	buildInfo(): Promise<BuildInfo>;
	/**
	 * STOPGAP(update-script): fetch `main` and `develop` from the code folder's
	 * `origin` and read their latest commits. Never changes the working tree or
	 * the checked-out branch, and never rejects for being offline (see `error`).
	 */
	updateChannels(): Promise<UpdateChannels>;
}

/** Same limit as `MAX_CACHE_BYTES` in src-tauri/src/cache_ops.rs. */
export const MAX_CACHE_BYTES = 25 * 1024 * 1024;

/**
 * A path inside `.vaultops/cache/`, same rule as src-tauri/src/cache_ops.rs:
 * one or more parts joined by `/`, each made of letters, digits, `-`, `_` and
 * `.`, never starting with a dot (so no `..` and no hidden files).
 */
export function isCachePath(path: string): boolean {
	return path
		.split("/")
		.every((part) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/.test(part));
}

/** Same list as `ALLOWED` in src-tauri/src/app_files.rs. */
export const APP_FILE_NAMES = [
	"session.json",
	"crash-report.txt",
	"maintainer.json",
	"unsaved-recovery.txt",
] as const;
export type AppFileName = (typeof APP_FILE_NAMES)[number];
