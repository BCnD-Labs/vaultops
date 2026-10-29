/** A document node as far as plain text is concerned. */
export interface TextNode {
	type?: string;
	text?: string;
	content?: TextNode[];
}

const INLINE = new Set(["text", "hardBreak"]);

/** A block that holds text directly (not other blocks). */
const holdsText = (node: TextNode) =>
	!(node.content ?? []).some(
		(child) => child.type !== undefined && !INLINE.has(child.type),
	);

function inlineText(node: TextNode): string {
	if (typeof node.text === "string") return node.text;
	if (node.type === "hardBreak") return "\n";
	return (node.content ?? []).map(inlineText).join("");
}

/** The text of a document, one line per text block (lists and quotes are opened up). */
export function docToPlainText(doc: TextNode): string {
	const lines: string[] = [];
	const walk = (nodes: TextNode[]) => {
		for (const node of nodes) {
			if (holdsText(node)) lines.push(inlineText(node));
			else walk(node.content ?? []);
		}
	};
	walk(doc.content ?? []);
	return lines.join("\n");
}

export interface RecoveryInput {
	path: string | null;
	title: string;
	doc: TextNode;
	now: Date;
}

/** What is kept when the window is closed with edits that could not be saved. */
export function buildRecoveryText(input: RecoveryInput): string {
	return [
		"VaultOps: unsaved text kept when the window was closed",
		`kept at: ${input.now.toISOString()}`,
		`note: ${input.path ?? "(not saved yet)"}`,
		`title: ${input.title}`,
		"",
		docToPlainText(input.doc),
		"",
	].join("\n");
}

/** Most characters kept in the recovery file (it holds up to 8 MB of bytes). */
export const MAX_RECOVERY_CHARS = 2_000_000;

/**
 * Add a new copy in front of the older ones, so closing twice never replaces
 * the first text. The oldest copies are cut when the file would get too big.
 */
export function joinRecovery(fresh: string, older: string | null): string {
	if (older === null || older.trim() === "") return fresh;
	const room = Math.max(0, MAX_RECOVERY_CHARS - fresh.length);
	return `${fresh}\n----------------\n\n${older.slice(0, room)}`;
}
