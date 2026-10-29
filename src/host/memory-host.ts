import { checkVaultPath, nameKey } from "../core/vault-path/vault-path";
import {
	type AppFileName,
	type AppInfo,
	type DirEntry,
	type EntryKind,
	type Host,
	HostError,
} from "./host";

interface FileNode {
	kind: "file";
	name: string;
	text: string;
}
interface FolderNode {
	kind: "folder";
	name: string;
	children: Map<string, Node>;
}
type Node = FileNode | FolderNode;

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

	async readText(path: string): Promise<string> {
		const node = this.find(this.parts(path));
		if (!node) throw new HostError("not-found", "file not found");
		if (node.kind === "folder")
			throw new HostError("is-a-folder", "path is a folder");
		return node.text;
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
