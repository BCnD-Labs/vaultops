import type { Block } from "../core/note-format";
import { type Props, readProps } from "../core/notes/properties";
import { plainTextOf } from "../core/notes/scan";

// Keep each reply small, including notes with a single very long block.
export const pageSize = 8;
export function page<Row extends object>(
	tool: string,
	args: { offset: number },
	rows: Row[],
	emptyHint: string,
	/** The exact call to make with the first item, so a small model keeps going. */
	nextStep?: (first: Row) => string,
) {
	const { offset } = args;
	const items = rows.slice(offset, offset + pageSize);
	const nextOffset = offset + items.length;
	const truncated = nextOffset < rows.length;
	const first = items[0];
	return {
		items,
		next_step: first && nextStep ? nextStep(first) : null,
		truncated,
		hint: truncated
			? `Call ${tool} with ${JSON.stringify({ ...args, offset: nextOffset })} to see more.`
			: rows.length === 0
				? emptyHint
				: items.length === 0
					? `No items at this offset. Call ${tool} with ${JSON.stringify({ ...args, offset: 0 })} to start over.`
					: null,
	};
}

export function chunks(text: string) {
	return text.match(/.{1,400}/gsu) ?? [""];
}

export function titlePreview(title: string) {
	return title.length > 160 ? `${title.slice(0, 159)}…` : title;
}

export function blockRows(blocks: Block[]) {
	return blocks.flatMap((block) =>
		chunks(plainTextOf([block])).map((text, index) => ({
			id: block.id ?? null,
			type: block.type,
			parent: block.parent,
			text,
			chunk: index + 1,
		})),
	);
}

export function propertyRows(props: Props | null) {
	return readProps(props ?? {}).flatMap((prop) => {
		const value = prop.known ? prop.value : null;
		const values = Array.isArray(value) ? value : [value];
		return (values.length ? values : [null]).flatMap((entry, index) => {
			const parts = typeof entry === "string" ? chunks(entry) : [entry];
			return parts.map((part, chunk) => ({
				name: titlePreview(prop.name),
				type: prop.type,
				value: part,
				item: Array.isArray(value) && values.length ? index + 1 : null,
				chunk: chunk + 1,
			}));
		});
	});
}

/**
 * Strict inputs whose unknown-field error names the fields the tool does take
 * and, when given, the tool to use instead (small models guess field names).
 */
export function unknownFieldError(
	tool: string,
	fields: string[],
	instead?: string,
) {
	return (issue: { code?: string; keys?: string[] }) =>
		issue.code === "unrecognized_keys"
			? `${tool} does not take ${(issue.keys ?? []).map((k) => `"${k}"`).join(", ")}. It takes: ${fields.length ? fields.join(", ") : "no fields (pass {})"}.${instead ? ` ${instead}` : ""}`
			: undefined;
}

/**
 * A file's state in plain words. Named file_status (not "truncated") so it
 * can't be mixed up with paging, where truncated means "more pages".
 */
export function fileStatus(group: string | undefined): string {
	switch (group) {
		case "good":
			return "ok";
		case "truncated":
			return "partly unreadable: some lines of this file could not be read, so some text is missing and cannot be fetched. Tell the user; the VaultOps app's Vault health screen can repair it.";
		case "newer-format":
			return "newer format: made by a newer VaultOps, so some parts may not show.";
		case "corrupt":
			return "unreadable: this file could not be read. Tell the user to check it in the VaultOps app.";
		case undefined:
			return "missing: no file at this path.";
		default:
			return group;
	}
}
