import type { JSONContent } from "@tiptap/core";

export const highlightColors = [
	"yellow",
	"green",
	"blue",
	"pink",
	"orange",
	"purple",
] as const;
type Color = (typeof highlightColors)[number];
export interface HighlightItem {
	blockId: string;
	text: string;
	color: Color;
	offset: number;
}

export function highlightsOf(blocks: JSONContent[] = []): HighlightItem[] {
	const result: HighlightItem[] = [];
	for (const block of blocks) {
		if (block.type === "database") continue;
		let offset = 0;
		let previous: HighlightItem | undefined;
		for (const run of block.content ?? []) {
			const mark = run.marks?.find((mark) => mark.type === "highlight");
			if (run.text && mark && typeof block.attrs?.id === "string") {
				const color =
					highlightColors.find((c) => c === mark.attrs?.color) ?? "yellow";
				if (previous?.color === color) previous.text += run.text;
				else {
					previous = { blockId: block.attrs.id, text: run.text, color, offset };
					result.push(previous);
				}
			} else {
				previous = undefined;
				if (run.content) result.push(...highlightsOf([run]));
			}
			offset += run.text?.length ?? 1;
		}
	}
	return result;
}
