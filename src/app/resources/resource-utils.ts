import {
	cardExtras,
	cardFields,
	type FieldKind,
	type ResourceCard,
	type ResourceType,
} from "../../core/resources/resources";

export type Mode = "view" | "pick" | "form" | "settings";

export interface FormState {
	typeId: string;
	/** The card being edited, or null for a new one. */
	path: string | null;
	title: string;
	values: Record<string, string>;
	showMore: boolean;
	/** The form as it was opened, to tell whether anything changed. */
	original: string;
}

export const STARTERS: { label: string; kind: FieldKind }[] = [
	{ label: "Notes", kind: "long" },
	{ label: "Date", kind: "date" },
	{ label: "Link", kind: "link" },
	{ label: "Source", kind: "text" },
];

export function whenLabel(iso: string, now = Date.now()): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "";
	const days = Math.floor((now - t) / 86_400_000);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	return `${Math.round(days / 7)} wk ago`;
}

export const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** The first couple of short values, for the card list. */
export function subtitle(
	card: ResourceCard,
	type: ResourceType | null,
): string {
	const bits: string[] = [];
	if (type) {
		for (const { field, value } of cardFields(card, type)) {
			if (field.kind !== "long" && value.trim() !== "" && bits.length < 2) {
				bits.push(value);
			}
		}
	} else {
		for (const extra of cardExtras(card, null)) {
			if (extra.value && bits.length < 2) bits.push(extra.value);
		}
	}
	return bits.length > 0 ? bits.join(" · ") : "Only a name so far";
}

export function labelOf(filter: string): string {
	if (filter === "recent") return "Recent";
	if (filter === "none") return "No type";
	return "All";
}
