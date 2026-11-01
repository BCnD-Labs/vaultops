import { isInsideVaultOps } from "../vault/vault";

/** What the tree needs to know about a note (the sidebar's rows fit this). */
export interface TreeNote {
	path: string;
	title: string;
	readOnly: boolean;
}

export interface FolderNode {
	kind: "folder";
	name: string;
	/** Vault-relative path of the folder. */
	path: string;
	children: TreeNode[];
}

export interface NoteNode {
	kind: "note";
	/** The note's title. */
	name: string;
	path: string;
	readOnly: boolean;
}

export type TreeNode = FolderNode | NoteNode;

function byName(a: string, b: string): number {
	return a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b);
}

function sortChildren(children: TreeNode[]): void {
	children.sort((a, b) => {
		if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
		return byName(a.name, b.name) || a.path.localeCompare(b.path);
	});
	for (const child of children) {
		if (child.kind === "folder") sortChildren(child.children);
	}
}

/**
 * Arrange folders and notes as a tree: folders first, then notes, each by
 * name ignoring case. Empty folders are kept. Anything inside `.vaultops/`
 * (the app's own hidden folder) is left out, and a note whose folder isn't in
 * `folders` still gets its folders made, so no note goes missing.
 */
export function buildTree(folders: string[], notes: TreeNote[]): TreeNode[] {
	const root: FolderNode = { kind: "folder", name: "", path: "", children: [] };
	const made = new Map<string, FolderNode>([["", root]]);

	function folderAt(path: string): FolderNode {
		const existing = made.get(path);
		if (existing) return existing;
		const cut = path.lastIndexOf("/");
		const parent = folderAt(cut === -1 ? "" : path.slice(0, cut));
		const node: FolderNode = {
			kind: "folder",
			name: cut === -1 ? path : path.slice(cut + 1),
			path,
			children: [],
		};
		parent.children.push(node);
		made.set(path, node);
		return node;
	}

	for (const folder of folders) {
		if (folder !== "" && !isInsideVaultOps(folder)) folderAt(folder);
	}
	for (const note of notes) {
		if (isInsideVaultOps(note.path)) continue;
		const cut = note.path.lastIndexOf("/");
		folderAt(cut === -1 ? "" : note.path.slice(0, cut)).children.push({
			kind: "note",
			name: note.title,
			path: note.path,
			readOnly: note.readOnly,
		});
	}
	sortChildren(root.children);
	return root.children;
}

/** The folders above a path, outermost first: "a/b/n.vnote" gives ["a", "a/b"]. */
export function ancestorsOf(path: string): string[] {
	const parts = path.split("/").slice(0, -1);
	return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}
