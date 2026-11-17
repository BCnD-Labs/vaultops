import { expect, it } from "vitest";
import {
	createCard,
	listCards,
	loadTypes,
	type ResourceCard,
	type ResourceType,
} from "../../core/resources/resources";
import { openVault } from "../../core/vault/vault";
import { MemoryHost } from "../../host/memory-host";
import {
	labelOf,
	plural,
	STARTERS,
	subtitle,
	whenLabel,
} from "./resource-utils";

const NOW = Date.parse("2026-06-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

async function cardOf(
	typeId: string,
	name: string,
	values: Record<string, string>,
): Promise<{ card: ResourceCard; type: ResourceType }> {
	const host = new MemoryHost();
	await openVault(host);
	const type = (await loadTypes(host)).find((t) => t.id === typeId);
	if (!type) throw new Error(`no ${typeId} type`);
	const made = await createCard(host, type, name, values);
	if (!made.ok) throw new Error(made.message);
	const card = (await listCards(host)).find((c) => c.title === name);
	if (!card) throw new Error("card not listed");
	return { card, type };
}

it("whenLabel words how long ago a card changed", () => {
	expect(whenLabel(daysAgo(0), NOW)).toBe("today");
	expect(whenLabel(daysAgo(1), NOW)).toBe("yesterday");
	expect(whenLabel(daysAgo(3), NOW)).toBe("3 days ago");
	expect(whenLabel(daysAgo(14), NOW)).toBe("2 wk ago");
	expect(whenLabel("", NOW)).toBe("");
	expect(whenLabel("not a date", NOW)).toBe("");
});

it("plural counts with the right word", () => {
	expect(plural(1, "card")).toBe("1 card");
	expect(plural(0, "card")).toBe("0 cards");
	expect(plural(2, "more field")).toBe("2 more fields");
	expect(plural(2, "category", "categories")).toBe("2 categories");
});

it("labelOf names the built-in filters", () => {
	expect(labelOf("recent")).toBe("Recent");
	expect(labelOf("none")).toBe("No type");
	expect(labelOf("all")).toBe("All");
});

it("STARTERS lists the optional fields a new type can begin with", () => {
	expect(STARTERS.map((s) => s.label)).toEqual([
		"Notes",
		"Date",
		"Link",
		"Source",
	]);
});

it("subtitle shows up to two short values, skipping long ones", async () => {
	const { card, type } = await cardOf("contact", "Mara", {
		Organization: "Halden Press",
		Phone: "555 0100",
		Email: "mara@x.example",
	});
	const text = subtitle(card, type);
	expect(text.split(" · ")).toHaveLength(2);
	expect(text).toContain("Halden Press");
});

it("subtitle says so when a card has only a name", async () => {
	const { card, type } = await cardOf("contact", "Jonas", {});
	expect(subtitle(card, type)).toBe("Only a name so far");
});

it("subtitle falls back to extra properties when the card has no type", async () => {
	const { card } = await cardOf("contact", "Mara", { Phone: "555 0100" });
	expect(subtitle(card, null)).toBe("555 0100");
});
