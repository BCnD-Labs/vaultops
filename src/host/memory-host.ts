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
		/** Every save point's description, oldest first. */
		log: string[];
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
		return [...(this.history?.log ?? [])];
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
				log: ["History turned on"],
			};
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
			let changed = false;
			const next = new Map(history.saved);
			for (const [path, text] of now)
				if (take(path) && history.saved.get(path) !== text) {
					next.set(path, text);
					changed = true;
				}
			for (const path of history.saved.keys())
				if (take(path) && !now.has(path)) {
					next.delete(path);
					changed = true;
				}
			if (!changed)
				return { saved: false, commit: null, status: await this.vcs.status() };
			history.saved = next;
			history.log.push(message.trim() || "Save point");
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
