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

/** Whether a working git is installed (src-tauri/src/git_ops.rs). */
export interface GitInfo {
	found: boolean;
	/** For example `2.50.1`; null when not found. */
	version: string | null;
	/** macOS: git is missing because Apple's free Command Line Tools are. */
	needsDeveloperTools: boolean;
}

export type VcsChangeKind =
	| "modified"
	| "added"
	| "deleted"
	| "renamed"
	| "untracked"
	| "conflicted";

/** One file changed since the last save point. */
export interface VcsChange {
	path: string;
	kind: VcsChangeKind;
	/** The old path of a rename. */
	from?: string;
}

export interface VcsStatus {
	/** False when history is off for this vault; the rest is then empty. */
	enabled: boolean;
	/** History is off because the folder already is someone else's git repo. */
	otherRepo: boolean;
	/** The cloud service syncing the vault folder ("iCloud Drive"…), or null. */
	syncedFolder: string | null;
	/** The current branch, or null when detached or before the first save point. */
	branch: string | null;
	changes: VcsChange[];
	/** A merge has started and is waiting to be finished or cancelled. */
	merging: boolean;
}

/** What starting a merge did. */
export interface MergeStart {
	/** Nothing to merge: the current branch already has everything. */
	upToDate: boolean;
	/**
	 * Files changed on both sides, still holding the current branch's version.
	 * The app merges the notes among them block by block.
	 */
	conflicted: string[];
	/** Every file the merge changes (including the conflicted ones). */
	changed: string[];
}

/** What restoring the vault to a save point did. */
export interface VaultRestore {
	/** Files that existed then, now back to how they were. */
	restored: number;
	/** Files created after it, still in the vault. */
	newer: string[];
	status: VcsStatus;
}

/** A conflicted file's three versions; null where a side added or deleted it. */
export interface MergeStages {
	base: string | null;
	mine: string | null;
	theirs: string | null;
}

/** The result of a save point. */
export interface SavePointResult {
	/** False when there was nothing to save; no save point was made. */
	saved: boolean;
	/** The new save point's short id, or null. */
	commit: string | null;
	status: VcsStatus;
}

/** One save point in the history list (src-tauri/src/vcs.rs `LogEntry`). */
export interface VcsLogEntry {
	id: string;
	shortId: string;
	author: string;
	/** ISO 8601 time. */
	date: string;
	/** Parent ids (two for a merge). */
	parents: string[];
	/** Branch names pointing at this save point. */
	branches: string[];
	/** True for the save point the vault is on now. */
	head: boolean;
	/** The description's first line. */
	subject: string;
	/** The rest of the description ("" when none). */
	body: string;
	filesChanged: number;
	/** In a one-file history: the file's path at this save point (it may have been renamed since). */
	path?: string;
}

export interface VcsLog {
	entries: VcsLogEntry[];
	/** True when older save points follow. */
	hasMore: boolean;
}

/** One branch of the vault's history. */
export interface VcsBranch {
	name: string;
	/** The branch the vault is on now. */
	current: boolean;
	/** Its newest save point's short id and description. */
	shortId: string;
	subject: string;
}

/** Same codes as `GitErrorCode` in src-tauri/src/git_ops.rs. */
export const VCS_ERROR_CODES = [
	"missing",
	"invalid-argument",
	"failed",
	"timed-out",
	"io",
] as const;
export type VcsErrorCode = (typeof VCS_ERROR_CODES)[number];

/** A version-control error: a code and a short message without the vault's location. */
export class VcsError extends Error {
	readonly code: VcsErrorCode;
	constructor(code: VcsErrorCode, message: string) {
		super(message);
		this.name = "VcsError";
		this.code = code;
	}
}

/**
 * The vault's history, run by git on the native side. Commands work on the open
 * vault only and take checked values, never raw git arguments.
 */
export interface VcsHost {
	/** Whether git is installed (found once per launch). */
	detect(): Promise<GitInfo>;
	/** What changed since the last save point, or `enabled: false`. */
	status(): Promise<VcsStatus>;
	/**
	 * Turn history on: a repo on branch `main` with the vault's ignore rules,
	 * `name` shown on save points, and a first save point of everything.
	 * Refused when history is already on or the folder is another git repo.
	 */
	enable(name: string): Promise<VcsStatus>;
	/**
	 * Make a save point of every change, or only of `paths` (vault-relative).
	 * An empty description becomes "Save point". Nothing to save resolves with
	 * `saved: false`. The caller saves open notes to disk first.
	 */
	savePoint(message: string, paths?: string[]): Promise<SavePointResult>;
	/**
	 * A page of save points on the current branch, newest first: skip `skip`,
	 * then up to `limit` (at most 200). With `path`, only those that changed
	 * that file, following renames. With `allBranches`, every branch.
	 */
	log(options: {
		path?: string;
		skip: number;
		limit: number;
		/** Every branch, children before parents (for the graph). */
		allBranches?: boolean;
	}): Promise<VcsLog>;
	/** A file's text as it was at save point `commit` (an id from `log`). */
	show(commit: string, path: string): Promise<string>;
	/** Every branch, the current one marked. */
	branches(): Promise<VcsBranch[]>;
	/**
	 * A new branch at the current save point; with `switchTo`, the vault moves to
	 * it (refused while anything is unsaved in history).
	 */
	createBranch(name: string, switchTo: boolean): Promise<VcsStatus>;
	/**
	 * Move the vault to another branch: every file becomes that branch's version.
	 * Refused while anything is unsaved in history. The caller saves open notes
	 * first and reads them again afterwards.
	 */
	switchBranch(name: string): Promise<VcsStatus>;
	renameBranch(from: string, to: string): Promise<VcsBranch[]>;
	/** Delete a branch whose save points are merged elsewhere; never the current one. */
	deleteBranch(name: string): Promise<VcsBranch[]>;
	/**
	 * Start merging `branch` into the current branch, without the save point yet.
	 * Refused while anything is unsaved in history or a merge is in progress.
	 */
	mergeStart(branch: string): Promise<MergeStart>;
	/** During a merge: a conflicted file's base, mine and theirs. */
	mergeStages(path: string): Promise<MergeStages>;
	/** During a merge: these files now hold their merged result (or are gone). */
	mergeMarkResolved(paths: string[]): Promise<VcsStatus>;
	/** Make the merge's save point; refused while a file is unresolved. */
	mergeFinish(message: string): Promise<VcsStatus>;
	/** Cancel the merge: every file goes back to the current branch's last save point. */
	mergeAbort(): Promise<VcsStatus>;
	/**
	 * Put every file that existed at save point `commit` back to how it was.
	 * Newer files are kept and listed; nothing becomes a save point yet. Refused
	 * while anything is unsaved in history.
	 */
	restoreVault(commit: string): Promise<VaultRestore>;
	/**
	 * Undo one save point with a new one that reverses it. Refused, changing
	 * nothing, when later save points changed the same files.
	 */
	undoSavePoint(commit: string): Promise<VcsStatus>;
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

	/** The vault's version history. */
	readonly vcs: VcsHost;

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
	/** The same for an image block: the picker is titled for an image. */
	chooseImage(): Promise<string | null>;
	/**
	 * Store a pasted or dropped image in attachments/ as `name` (a plain file
	 * name, see `attachmentName`), or `name-2`... when that is taken, and
	 * resolve to its vault path. The bytes are kept exactly as they are; more
	 * than `MAX_IMAGE_BYTES` is refused.
	 */
	importAttachment(name: string, bytes: ArrayBuffer): Promise<string>;

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

/** The vault file operations needed by read-only core features. */
export type VaultReadHost = Pick<Host, "readText" | "list" | "kindOf">;

/** Same limit as `MAX_IMAGE_BYTES` in src-tauri/src/file_ops.rs. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

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
