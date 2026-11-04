import type { JSONContent } from "@tiptap/core";

export interface TextStats {
	words: number;
	characters: number;
}

// The text of every block that holds text directly, one entry per block, so
// two paragraphs never run together into one word.
function lines(node: JSONContent, out: string[]): string[] {
	const children = node.content ?? [];
	if (children.some((child) => child.type === "text")) {
		out.push(
			children
				.filter((child) => child.type === "text")
				.map((child) => child.text ?? "")
				.join(""),
		);
	}
	for (const child of children) if (child.type !== "text") lines(child, out);
	return out;
}

const segmenter =
	typeof Intl !== "undefined" && "Segmenter" in Intl
		? new Intl.Segmenter(undefined, { granularity: "word" })
		: null;

function wordsIn(text: string): number {
	if (segmenter) {
		let count = 0;
		for (const part of segmenter.segment(text)) if (part.isWordLike) count++;
		return count;
	}
	return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Words and characters of a note's text. Characters include spaces but not the
 * breaks between blocks. Only text is counted: ids, attributes and the title
 * are not part of either number.
 */
export function textStats(doc: JSONContent | null | undefined): TextStats {
	if (!doc) return { words: 0, characters: 0 };
	const all = lines(doc, []);
	return {
		words: all.reduce((sum, line) => sum + wordsIn(line), 0),
		characters: all.reduce((sum, line) => sum + [...line].length, 0),
	};
}
