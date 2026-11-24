import { checkVaultPath, nameKey } from "../core/vault-path/vault-path";
import {
	type AppFileName,
	type AppInfo,
	type BuildInfo,
	type DirEntry,
	type EntryKind,
	type GitInfo,
	type Host,
	HostError,
	isCachePath,
	MAX_CACHE_BYTES,
	MAX_IMAGE_BYTES,
	type UpdateChannelName,
	type UpdateChannels,
	type UpdateScriptStatus,
	type VcsChange,
	VcsError,
	type VcsHost,
} from "./host";

interface FileNode {
	kind: "file";
	name: string;
	text: string | Uint8Array<ArrayBuffer>;
}
interface FolderNode {
	kind: "folder";
	name: string;
	children: Map<string, Node>;
}
type Node = FileNode | FolderNode;

/** Folders above a trashed note: `.vaultops`, `trash`, then the time folder. */
const TRASH_DEPTH = 3;

/**
 * An in-memory host for tests. It behaves like the Mac's default file system:
 * names that differ only in capital letters or Unicode form are the same entry,
 * and the name as first written is the one shown.
 */
export class MemoryHost implements Host {
	private readonly root: FolderNode = {
		kind: "folder",
		name: "",
		children: new Map(),
	};

	/** What `vcs.detect()` reports; tests can set "git missing". */
	gitInfo: GitInfo = {
		found: true,
		version: "2.50.1",
		needsDeveloperTools: false,
	};
	private history: {
		branch: string;
		/** Every file's content at the last save point. */
		saved: Map<string, string>;
		/** The name shown on save points. */
		author: string;
		/** Every save point, oldest first. */
		log: { message: string; files: string[]; snapshot: Map<string, string> }[];
	} | null = null;
	/** Other branches' saved files and save points (the current one is in `history`). */
	private otherBranches = new Map<
		string,
		{
			saved: Map<string, string>;
			log: NonNullable<MemoryHost["history"]>["log"];
		}
	>();
	/** A merge in progress: the other branch, the three versions and what's left to resolve. */
	private merge: {
		branch: string;
		base: Map<string, string>;
		theirs: Map<string, string>;
		theirsLog: NonNullable<MemoryHost["history"]>["log"];
		conflicted: Set<string>;
	} | null = null;
	/** Test helper: the folder already is someone else's git repo. */
	otherRepo = false;
	/** Test helper: the cloud service syncing the folder. */
	syncedFolder: string | null = null;

	/** Test helper: turn history on (no save point yet). */
	enableHistory(branch = "main"): void {
		this.history = { branch, saved: new Map(), author: "Test", log: [] };
	}

	/** Every save point's description, oldest first (tests). */
	get historyLog(): string[] {
		return (this.history?.log ?? []).map((entry) => entry.message);
	}

	/** The name history was turned on with (tests). */
	get historyAuthor(): string | null {
		return this.history?.author ?? null;
	}

	/** Test helper: take a save point of every file as it is now. */
	saveAll(): void {
		if (!this.history) throw new HostError("io", "history is off");
		this.history.saved = this.allFiles();
	}

	private requireHistory() {
		if (!this.history)
			throw new VcsError("invalid-argument", "history is off for this vault");
		return this.history;
	}

	private async requireClean() {
		if ((await this.vcs.status()).changes.length > 0)
			throw new VcsError(
				"invalid-argument",
				"make a save point first: switching branches needs every change saved in history",
			);
	}

	private branchList() {
		const history = this.requireHistory();
		const row = (name: string, log: typeof history.log, current: boolean) => ({
			name,
			current,
			shortId: log.length.toString(16).padStart(7, "0"),
			subject: (log.at(-1)?.message ?? "").split("\n")[0] ?? "",
		});
		return [
			row(history.branch, history.log, true),
			...[...this.otherBranches].map(([name, b]) => row(name, b.log, false)),
		].sort((a, b) => a.name.localeCompare(b.name));
	}

	private async writeFile(path: string, text: string) {
		const slash = path.lastIndexOf("/");
		if (slash > 0) await this.makeFolder(path.slice(0, slash));
		await this.writeTextAtomic(path, text);
	}

	private async removeFile(path: string) {
		const parts = this.parts(path);
		const name = parts.pop();
		const folder = parts.length ? this.find(parts) : this.root;
		if (folder?.kind === "folder" && name !== undefined)
			for (const key of folder.children.keys())
				if (key === nameKey(name)) folder.children.delete(key);
	}

	/** Every file replaced by `files` (text only), like git checking out a branch. */
	private async writeAll(files: Map<string, string>) {
		this.root.children.clear();
		for (const [path, text] of files) {
			const slash = path.lastIndexOf("/");
			if (slash > 0) await this.makeFolder(path.slice(0, slash));
			await this.writeTextAtomic(path, text);
		}
	}

	/** Every file as `path -> content` (bytes as a comparable string). */
	private allFiles(): Map<string, string> {
		const out = new Map<string, string>();
		const walk = (folder: FolderNode, prefix: string) => {
			for (const node of folder.children.values()) {
				const path = prefix ? `${prefix}/${node.name}` : node.name;
				if (node.kind === "folder") walk(node, path);
				else
					out.set(
						path,
						typeof node.text === "string"
							? node.text
							: `bytes:${node.text.join(",")}`,
					);
			}
		};
		walk(this.root, "");
		return out;
	}

	readonly vcs: VcsHost = {
		detect: async () => ({ ...this.gitInfo }),
		status: async () => {
			const { otherRepo, syncedFolder } = this;
			if (!this.history)
				return {
					enabled: false,
					otherRepo,
					syncedFolder,
					branch: null,
					changes: [],
					merging: false,
				};
			const now = this.allFiles();
			const { saved, branch } = this.history;
			const changes: VcsChange[] = [];
			for (const [path, text] of now) {
				const before = saved.get(path);
				if (before === undefined) changes.push({ path, kind: "untracked" });
				else if (before !== text) changes.push({ path, kind: "modified" });
			}
			for (const path of saved.keys())
				if (!now.has(path)) changes.push({ path, kind: "deleted" });
			changes.sort((a, b) => a.path.localeCompare(b.path));
			return {
				enabled: true,
				otherRepo: false,
				syncedFolder,
				branch,
				changes,
				merging: this.merge !== null,
			};
		},
		enable: async (raw) => {
			const name = raw.trim().replace(/\s+/g, " ");
			if (name === "" || name.length > 80 || /[<>]/.test(name))
				throw new VcsError(
					"invalid-argument",
					"give a name of 1 to 80 characters",
				);
			if (this.history)
				throw new VcsError(
					"invalid-argument",
					"history is already on for this vault",
				);
			if (this.otherRepo)
				throw new VcsError(
					"invalid-argument",
					"this vault folder already is a git repository, so VaultOps left it alone",
				);
			if (!this.gitInfo.found)
				throw new VcsError("missing", "git is not installed");
			this.history = {
				branch: "main",
				saved: this.allFiles(),
				author: name,
				log: [
					{
						message: "History turned on",
						files: [...this.allFiles().keys()],
						snapshot: this.allFiles(),
					},
				],
			};
			return this.vcs.status();
		},
		log: async ({ path, skip, limit }) => {
			const history = this.history;
			if (!history)
				throw new VcsError("invalid-argument", "history is off for this vault");
			const id = (n: number) => n.toString(16).padStart(40, "0");
			const all = history.log
				.map((entry, n) => {
					const [subject = "", ...rest] = entry.message.split("\n");
					return {
						id: id(n + 1),
						shortId: id(n + 1).slice(-7),
						author: history.author,
						date: new Date(Date.UTC(2026, 10, 1, 0, n)).toISOString(),
						parents: n === 0 ? [] : [id(n)],
						branches: n === history.log.length - 1 ? [history.branch] : [],
						head: n === history.log.length - 1,
						subject,
						body: rest.join("\n").trim(),
						filesChanged: entry.files.length,
						files: entry.files,
						...(path ? { path } : {}),
					};
				})
				.filter((entry) => !path || entry.files.includes(path))
				.reverse();
			const page = all.slice(skip, skip + Math.min(Math.max(limit, 1), 200));
			return {
				entries: page.map(({ files: _files, ...entry }) => entry),
				hasMore: skip + page.length < all.length,
			};
		},
		show: async (commit, path) => {
			const entry = this.history?.log[Number.parseInt(commit, 16) - 1];
			const text = entry?.snapshot.get(path);
			if (text === undefined)
				throw new VcsError(
					"failed",
					`path '${path}' does not exist in '${commit}'`,
				);
			return text;
		},
		branches: async () => this.branchList(),
		createBranch: async (raw, switchTo) => {
			const history = this.requireHistory();
			const name = raw.trim();
			if (!/^[\w][\w./-]*$/.test(name) || name.includes(".."))
				throw new VcsError("invalid-argument", "not a usable branch name");
			if (
				this.branchList().some(
					(b) => b.name.toLowerCase() === name.toLowerCase(),
				)
			)
				throw new VcsError(
					"invalid-argument",
					"there is already a branch with this name",
				);
			if (switchTo) await this.requireClean();
			const copy = { saved: new Map(history.saved), log: [...history.log] };
			if (switchTo) {
				this.otherBranches.set(history.branch, {
					saved: history.saved,
					log: history.log,
				});
				history.branch = name;
				history.saved = copy.saved;
				history.log = copy.log;
			} else this.otherBranches.set(name, copy);
			return this.vcs.status();
		},
		switchBranch: async (name) => {
			const history = this.requireHistory();
			const target = this.otherBranches.get(name);
			if (!target)
				throw new VcsError(
					"invalid-argument",
					"there is no branch with this name",
				);
			await this.requireClean();
			this.otherBranches.delete(name);
			this.otherBranches.set(history.branch, {
				saved: history.saved,
				log: history.log,
			});
			history.branch = name;
			history.saved = target.saved;
			history.log = target.log;
			await this.writeAll(target.saved);
			return this.vcs.status();
		},
		renameBranch: async (from, to) => {
			const history = this.requireHistory();
			if (this.branchList().some((b) => b.name === to && b.name !== from))
				throw new VcsError(
					"invalid-argument",
					"there is already a branch with this name",
				);
			if (history.branch === from) history.branch = to;
			else {
				const b = this.otherBranches.get(from);
				if (!b)
					throw new VcsError(
						"invalid-argument",
						"there is no branch with this name",
					);
				this.otherBranches.delete(from);
				this.otherBranches.set(to, b);
			}
			return this.branchList();
		},
		deleteBranch: async (name) => {
			const history = this.requireHistory();
			if (history.branch === name)
				throw new VcsError(
					"invalid-argument",
					"switch to another branch before deleting this one",
				);
			const b = this.otherBranches.get(name);
			if (!b)
				throw new VcsError(
					"invalid-argument",
					"there is no branch with this name",
				);
			// Merged = every save point of it is also in another branch.
			const logs = [
				history.log,
				...[...this.otherBranches]
					.filter(([n]) => n !== name)
					.map(([, o]) => o.log),
			];
			if (!b.log.every((entry) => logs.some((log) => log.includes(entry))))
				throw new VcsError(
					"invalid-argument",
					"this branch has save points that aren't merged into another branch, so it was kept",
				);
			this.otherBranches.delete(name);
			return this.branchList();
		},
		mergeStart: async (branch) => {
			const history = this.requireHistory();
			const other = this.otherBranches.get(branch);
			if (!other)
				throw new VcsError(
					"invalid-argument",
					"there is no branch with this name",
				);
			if (this.merge)
				throw new VcsError(
					"invalid-argument",
					"a merge is already in progress; finish or cancel it first",
				);
			await this.requireClean();
			// The newest save point both branches share is the base.
			const shared = [...other.log]
				.reverse()
				.find((e) => history.log.includes(e));
			const base = shared?.snapshot ?? new Map<string, string>();
			const mine = history.saved;
			const theirs = other.saved;
			const conflicted = new Set<string>();
			const changed: string[] = [];
			for (const path of new Set([
				...mine.keys(),
				...theirs.keys(),
				...base.keys(),
			])) {
				const b = base.get(path);
				const m = mine.get(path);
				const t = theirs.get(path);
				if (m === t || t === b) continue;
				changed.push(path);
				if (m === b) {
					if (t === undefined) await this.removeFile(path);
					else await this.writeFile(path, t);
				} else conflicted.add(path);
			}
			if (
				changed.length === 0 &&
				other.log.every((e) => history.log.includes(e))
			)
				return { upToDate: true, conflicted: [], changed: [] };
			this.merge = { branch, base, theirs, theirsLog: other.log, conflicted };
			return {
				upToDate: false,
				conflicted: [...conflicted].sort(),
				changed: changed.sort(),
			};
		},
		mergeStages: async (path) => {
			const merge = this.merge;
			if (!merge)
				throw new VcsError("invalid-argument", "no merge is in progress");
			return {
				base: merge.base.get(path) ?? null,
				mine: this.requireHistory().saved.get(path) ?? null,
				theirs: merge.theirs.get(path) ?? null,
			};
		},
		mergeMarkResolved: async (paths) => {
			if (!this.merge)
				throw new VcsError("invalid-argument", "no merge is in progress");
			for (const path of paths) this.merge.conflicted.delete(path);
			return this.vcs.status();
		},
		mergeFinish: async (message) => {
			const merge = this.merge;
			const history = this.requireHistory();
			if (!merge)
				throw new VcsError("invalid-argument", "no merge is in progress");
			if (merge.conflicted.size > 0)
				throw new VcsError("invalid-argument", "some files are not merged yet");
			for (const entry of merge.theirsLog)
				if (!history.log.includes(entry)) history.log.push(entry);
			history.saved = this.allFiles();
			history.log.push({
				message: message.trim() || "Merge",
				files: [],
				snapshot: new Map(history.saved),
			});
			this.merge = null;
			return this.vcs.status();
		},
		mergeAbort: async () => {
			if (!this.merge)
				throw new VcsError("invalid-argument", "no merge is in progress");
			this.merge = null;
			await this.writeAll(this.requireHistory().saved);
			return this.vcs.status();
		},
		restoreVault: async (commit) => {
			const history = this.requireHistory();
			const entry = history.log[Number.parseInt(commit, 16) - 1];
			if (!entry) throw new VcsError("failed", "unknown save point");
			await this.requireClean();
			for (const [path, text] of entry.snapshot)
				await this.writeFile(path, text);
			const newer = [...this.allFiles().keys()]
				.filter((p) => !entry.snapshot.has(p))
				.sort();
			return {
				restored: entry.snapshot.size,
				newer,
				status: await this.vcs.status(),
			};
		},
		undoSavePoint: async (commit) => {
			const history = this.requireHistory();
			const index = Number.parseInt(commit, 16) - 1;
			const entry = history.log[index];
			const before = history.log[index - 1];
			if (!entry || !before)
				throw new VcsError(
					"invalid-argument",
					"this save point can't be undone on its own (it is a merge or the first one)",
				);
			await this.requireClean();
			const later = history.log.slice(index + 1).flatMap((e) => e.files);
			if (entry.files.some((f) => later.includes(f)))
				throw new VcsError(
					"invalid-argument",
					"later save points changed the same notes, so this one can't be undone automatically; restore the notes from their History instead",
				);
			for (const path of entry.files) {
				const old = before.snapshot.get(path);
				if (old === undefined) await this.removeFile(path);
				else await this.writeFile(path, old);
			}
			await this.vcs.savePoint(`Revert "${entry.message.split("\n")[0]}"`);
			return this.vcs.status();
		},
		savePoint: async (message, paths) => {
			const history = this.history;
			if (!history)
				throw new VcsError("invalid-argument", "history is off for this vault");
			if (paths && paths.length === 0)
				throw new VcsError(
					"invalid-argument",
					"choose at least one file to save",
				);
			const now = this.allFiles();
			const take = (path: string) => !paths || paths.includes(path);
			const files: string[] = [];
			const next = new Map(history.saved);
			for (const [path, text] of now)
				if (take(path) && history.saved.get(path) !== text) {
					next.set(path, text);
					files.push(path);
				}
			for (const path of history.saved.keys())
				if (take(path) && !now.has(path)) {
					next.delete(path);
					files.push(path);
				}
			if (files.length === 0)
				return { saved: false, commit: null, status: await this.vcs.status() };
			history.saved = next;
			history.log.push({
				message: message.trim() || "Save point",
				files,
				snapshot: new Map(next),
			});
			const commit = history.log.length.toString(16).padStart(7, "0");
			return { saved: true, commit, status: await this.vcs.status() };
		},
	};

	async appInfo(): Promise<AppInfo> {
		return { name: "vaultops", version: "0.0.0-memory" };
	}

	/** The in-memory host is its own vault; "choosing" it just names it. */
	async chooseVault(): Promise<string | null> {
		return "Memory vault";
	}

	async currentVault(): Promise<string | null> {
		return "Memory vault";
	}

	private fileAt(parts: string[]): FileNode {
		const node = this.find(parts);
		if (!node) throw new HostError("not-found", "file not found");
		if (node.kind === "folder")
			throw new HostError("is-a-folder", "path is a folder");
		return node;
	}

	async readText(path: string): Promise<string> {
		const { text } = this.fileAt(this.parts(path));
		return typeof text === "string" ? text : new TextDecoder().decode(text);
	}

	nextCover: { name: string; bytes: Uint8Array<ArrayBuffer> } | null = null;

	async chooseCover(): Promise<string | null> {
		const picked = this.nextCover;
		this.nextCover = null;
		return picked && this.importAttachment(picked.name, picked.bytes.buffer);
	}

	chooseImage(): Promise<string | null> {
		return this.chooseCover();
	}

	async importAttachment(file: string, bytes: ArrayBuffer): Promise<string> {
		const parts = this.parts(file);
		const match = /^(.*)\.(png|jpe?g|gif|webp)$/i.exec(file);
		if (parts.length !== 1 || !match || file.startsWith("."))
			throw new HostError("invalid-path", "expected an image filename");
		if (bytes.byteLength > MAX_IMAGE_BYTES)
			throw new HostError("invalid-path", "the image is larger than 25 MB");
		await this.makeFolder("attachments");
		const { children } = this.folderAt(["attachments"]);
		const stem =
			new TextEncoder().encode(match[1]).length > 230 ? "image" : match[1];
		let name = file;
		for (let n = 2; children.has(nameKey(name)); n++) {
			name = `${stem}-${n}.${match[2]}`;
		}
		children.set(nameKey(name), {
			kind: "file",
			name,
			text: new Uint8Array(bytes.slice(0)),
		});
		return `attachments/${name}`;
	}

	async readCover(path: string): Promise<ArrayBuffer> {
		const parts = this.parts(path);
		if (
			!path.startsWith("attachments/") ||
			!/\.(png|jpe?g|gif|webp)$/i.test(path)
		)
			throw new HostError(
				"invalid-path",
				"expected an image under attachments",
			);
		const { text } = this.fileAt(parts);
		const bytes =
			typeof text === "string"
				? new TextEncoder().encode(text)
				: new Uint8Array(text);
		return bytes.buffer;
	}

	private cacheParts(path: string): string[] {
		if (!isCachePath(path))
			throw new HostError("invalid-path", "not a valid cache path");
		return [".vaultops", "cache", ...path.split("/")];
	}

	async readCache(path: string): Promise<ArrayBuffer | null> {
		const node = this.find(this.cacheParts(path));
		if (!node) return null;
		if (node.kind === "folder")
			throw new HostError("is-a-folder", "path is a folder");
		return typeof node.text === "string"
			? new TextEncoder().encode(node.text).buffer
			: node.text.slice().buffer;
	}

	async writeCache(path: string, bytes: ArrayBuffer): Promise<void> {
		const parts = this.cacheParts(path);
		if (bytes.byteLength > MAX_CACHE_BYTES)
			throw new HostError("invalid-path", "the file is larger than 25 MB");
		await this.makeFolder(parts.slice(0, -1).join("/"));
		const parent = this.folderAt(parts.slice(0, -1));
		const name = parts[parts.length - 1] as string;
		if (parent.children.get(nameKey(name))?.kind === "folder")
			throw new HostError("is-a-folder", "path is a folder");
		parent.children.set(nameKey(name), {
			kind: "file",
			name,
			text: new Uint8Array(bytes.slice(0)),
		});
	}

	async writeTextAtomic(path: string, text: string): Promise<void> {
		const parts = this.parts(path);
		const parent = this.folderAt(parts.slice(0, -1));
		const name = parts[parts.length - 1] as string;
		const existing = parent.children.get(nameKey(name));
		if (existing?.kind === "folder")
			throw new HostError("is-a-folder", "path is a folder");
		parent.children.set(nameKey(name), {
			kind: "file",
			name: existing?.name ?? name,
			text,
		});
	}

	async move(from: string, to: string): Promise<void> {
		const fromParts = this.parts(from);
		const toParts = this.parts(to);
		const fromParent = this.folderAt(fromParts.slice(0, -1));
		const fromName = fromParts[fromParts.length - 1] as string;
		const node = fromParent.children.get(nameKey(fromName));
		if (!node) throw new HostError("not-found", "source not found");

		const fromKey = fromParts.map(nameKey).join("/");
		const toKey = toParts.map(nameKey).join("/");
		if (node.kind === "folder" && toKey.startsWith(`${fromKey}/`))
			throw new HostError("invalid-path", "cannot move a folder into itself");

		const toParent = this.folderAt(toParts.slice(0, -1));
		const toName = toParts[toParts.length - 1] as string;
		const sameEntry = fromKey === toKey;
		if (!sameEntry && toParent.children.has(nameKey(toName)))
			throw new HostError("already-exists", "target already exists");

		fromParent.children.delete(nameKey(fromName));
		node.name = toName;
		toParent.children.set(nameKey(toName), node);
	}

	async list(folder: string): Promise<DirEntry[]> {
		const node = this.folderAt(this.parts(folder, true));
		return [...node.children.values()]
			.map((n) => ({ name: n.name, kind: n.kind }))
			.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	}

	async makeFolder(path: string): Promise<void> {
		let current = this.root;
		for (const part of this.parts(path)) {
			const next = current.children.get(nameKey(part));
			if (next?.kind === "file")
				throw new HostError("not-a-folder", "a file is in the way");
			if (next) {
				current = next;
				continue;
			}
			const created: FolderNode = {
				kind: "folder",
				name: part,
				children: new Map(),
			};
			current.children.set(nameKey(part), created);
			current = created;
		}
	}

	async kindOf(path: string): Promise<EntryKind | null> {
		return this.find(this.parts(path, true))?.kind ?? null;
	}

	async removeTrashed(path: string): Promise<void> {
		const parts = this.parts(path);
		if (
			parts.length <= TRASH_DEPTH ||
			parts[0] !== ".vaultops" ||
			parts[1] !== "trash"
		) {
			throw new HostError(
				"invalid-path",
				"only a note inside .vaultops/trash can be deleted forever",
			);
		}
		const node = this.find(parts);
		if (!node) throw new HostError("not-found", "note not found");
		if (node.kind === "folder")
			throw new HostError("is-a-folder", "path is a folder");
		this.folderAt(parts.slice(0, -1)).children.delete(
			nameKey(parts[parts.length - 1] as string),
		);
		// Remove the folders it left empty, innermost first, never `.vaultops/trash`.
		for (let len = parts.length - 1; len >= TRASH_DEPTH; len--) {
			const folder = this.folderAt(parts.slice(0, len));
			if (folder.children.size > 0) break;
			this.folderAt(parts.slice(0, len - 1)).children.delete(
				nameKey(parts[len - 1] as string),
			);
		}
	}

	/** Test helper: everything sent to the log, in order. */
	readonly logLines: string[] = [];

	async appendLog(lines: string): Promise<void> {
		this.logLines.push(lines);
	}

	private readonly appFiles = new Map<string, string>();

	async readAppFile(name: AppFileName): Promise<string | null> {
		return this.appFiles.get(name) ?? null;
	}

	async writeAppFile(name: AppFileName, text: string): Promise<void> {
		this.appFiles.set(name, text);
	}

	async readLogTail(maxLines: number): Promise<string> {
		const lines = this.logLines.join("\n").split("\n");
		return lines.slice(-maxLines).join("\n");
	}

	/** Test helpers: what the picker "chooses" next, and the reports written. */
	nextReportsFolder: string | null = "Reports";
	readonly reports = new Map<string, string>();
	private reportsFolderName: string | null = null;

	async chooseReportsFolder(): Promise<string | null> {
		if (this.nextReportsFolder !== null) {
			this.reportsFolderName = this.nextReportsFolder;
		}
		return this.nextReportsFolder;
	}

	async reportsFolder(): Promise<string | null> {
		return this.reportsFolderName;
	}

	async writeReport(name: string, text: string): Promise<void> {
		if (this.reportsFolderName === null) {
			throw new HostError("invalid-path", "no reports folder is chosen");
		}
		if (
			!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.txt$/.test(name) ||
			name.includes("..")
		) {
			throw new HostError("invalid-path", "not a valid report name");
		}
		this.reports.set(name, text);
	}

	/**
	 * Test helpers for the update script stopgap: how many times it was started,
	 * an error the next start throws, and what the script "reports" (set it to
	 * `finished` or `failed` to end a run).
	 */
	updateScriptStarts = 0;
	/** The channel each start asked for, oldest first. */
	updateScriptChannels: UpdateChannelName[] = [];
	nextUpdateScriptError: HostError | null = null;
	updateScript: UpdateScriptStatus = { state: "idle", lastLine: "" };

	async startUpdateScript(channel: UpdateChannelName): Promise<void> {
		if (channel !== "main" && channel !== "develop") {
			throw new HostError(
				"invalid-path",
				"the update channel must be main or develop",
			);
		}
		if (this.nextUpdateScriptError) throw this.nextUpdateScriptError;
		if (this.updateScript.state === "running") {
			throw new HostError("io", "an update is already running");
		}
		this.updateScriptStarts += 1;
		this.updateScriptChannels.push(channel);
		this.updateScript = { state: "running", lastLine: "" };
	}

	async updateScriptStatus(): Promise<UpdateScriptStatus> {
		return { ...this.updateScript };
	}

	/** Test knobs for the update check: what it reports, and how often it ran. */
	build: BuildInfo = { branch: "main", commit: "a".repeat(40), builtAt: "" };
	channels: UpdateChannels = {
		main: {
			exists: true,
			commit: "a".repeat(40),
			shortCommit: "aaaaaaa",
			committedAt: "2026-11-17T10:00:00Z",
			subject: "feat: latest on main",
		},
		develop: {
			exists: false,
			commit: "",
			shortCommit: "",
			committedAt: "",
			subject: "",
		},
		error: null,
	};
	updateChecks = 0;

	async buildInfo(): Promise<BuildInfo> {
		return { ...this.build };
	}

	async updateChannels(): Promise<UpdateChannels> {
		this.updateChecks += 1;
		return structuredClone(this.channels);
	}

	private readonly closeHandlers = new Set<() => Promise<boolean>>();

	async onCloseRequested(handler: () => Promise<boolean>): Promise<() => void> {
		this.closeHandlers.add(handler);
		return () => {
			this.closeHandlers.delete(handler);
		};
	}

	/** Test helper: ask the "window" to close. Resolves true if it would close. */
	async simulateClose(): Promise<boolean> {
		let allowed = true;
		for (const handler of [...this.closeHandlers]) {
			if (!(await handler())) allowed = false;
		}
		return allowed;
	}

	private parts(path: string, allowRoot = false): string[] {
		const check = checkVaultPath(path, { allowRoot });
		if (!check.ok) throw new HostError("invalid-path", check.reason);
		return check.parts;
	}

	private find(parts: string[]): Node | undefined {
		let current: Node = this.root;
		for (const part of parts) {
			if (current.kind !== "folder") return undefined;
			const next: Node | undefined = current.children.get(nameKey(part));
			if (!next) return undefined;
			current = next;
		}
		return current;
	}

	private folderAt(parts: string[]): FolderNode {
		const node = this.find(parts);
		if (!node) throw new HostError("not-found", "folder not found");
		if (node.kind !== "folder")
			throw new HostError("not-a-folder", "path is not a folder");
		return node;
	}
}
