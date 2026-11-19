import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { scanVault } from "../notes/scan";
import { openVault } from "../vault/vault";
import {
	addField,
	addType,
	applyValues,
	CARDS,
	cardExtras,
	cardFields,
	completeness,
	countValues,
	createCard,
	DEFAULT_TYPES,
	deleteType,
	listCards,
	loadTypes,
	missingRequired,
	RESOURCES,
	removeCard,
	removeField,
	searchCards,
	setCardType,
	setFieldRequired,
	TYPES_FILE,
	updateCard,
	updateType,
} from "./resources";

async function vault() {
	const host = new MemoryHost();
	await openVault(host);
	return host;
}

const NOW = new Date("2026-11-08T12:00:00Z");

// What the app wrote for a v1 file (two-space JSON, as saved on disk).
const V1_FILE =
	'{\n  "format": "vaultops-resource-types",\n  "v": 1,\n  "types": [\n    {\n      "id": "contact",\n      "name": "Contact",\n      "titleLabel": "Name",\n      "fields": [\n        {\n          "label": "Phone",\n          "kind": "text",\n          "required": false\n        },\n        {\n          "label": "Email",\n          "kind": "text",\n          "required": true\n        }\n      ]\n    },\n    {\n      "id": "book",\n      "name": "Book",\n      "titleLabel": "Title",\n      "fields": [\n        {\n          "label": "Author",\n          "kind": "text",\n          "required": false\n        },\n        {\n          "label": "Year",\n          "kind": "number",\n          "required": false\n        },\n        {\n          "label": "Notes",\n          "kind": "long",\n          "required": false\n        }\n      ]\n    }\n  ]\n}\n';

// What the app wrote for a v2 file (two-space JSON, as saved on disk).
const V2_FILE =
	'{\n  "format": "vaultops-resource-types",\n  "v": 2,\n  "types": [\n    {\n      "id": "book",\n      "name": "Book",\n      "titleLabel": "Title",\n      "fields": [\n        {\n          "label": "Author",\n          "kind": "text",\n          "required": false\n        },\n        {\n          "label": "Status",\n          "kind": "select",\n          "required": false,\n          "options": [\n            "To read",\n            "Reading",\n            "Done"\n          ]\n        },\n        {\n          "label": "Owned",\n          "kind": "checkbox",\n          "required": false\n        },\n        {\n          "label": "Genres",\n          "kind": "list",\n          "required": false\n        }\n      ],\n      "icon": "book",\n      "folder": "Books",\n      "template": "Book review.vnote"\n    }\n  ]\n}\n';

async function contact(host: MemoryHost, name: string, values = {}) {
	const types = await loadTypes(host);
	const type = types.find((t) => t.id === "contact");
	if (!type) throw new Error("no contact type");
	const result = await createCard(host, type, name, values, NOW);
	if (!result.ok) throw new Error(result.message);
	return result.path;
}

async function recoveryFiles(host: MemoryHost) {
	const out: string[] = [];
	const walk = async (folder: string) => {
		if ((await host.kindOf(folder)) !== "folder") return;
		for (const e of await host.list(folder)) {
			const p = `${folder}/${e.name}`;
			if (e.kind === "folder") await walk(p);
			else out.push(p);
		}
	};
	await walk(".vaultops/recovery");
	return out;
}

describe("resource types", () => {
	it("starts with Contact, Book and Article that each need only a name or title", async () => {
		const host = await vault();
		const types = await loadTypes(host);
		expect(types.map((t) => t.name)).toEqual(["Contact", "Book", "Article"]);
		expect(types.every((t) => t.fields.every((f) => !f.required))).toBe(true);
		expect(await host.kindOf(TYPES_FILE)).toBeNull();
	});

	it("does not hand out the shared defaults to be changed", async () => {
		const host = await vault();
		(await loadTypes(host))[0]?.fields.pop();
		expect(DEFAULT_TYPES[0]?.fields.length).toBe(7);
	});

	it("adds a type, keeps the defaults beside it and survives a reload", async () => {
		const host = await vault();
		const r = await addType(host, {
			name: " Recipe ",
			titleLabel: "Dish",
			fields: [{ label: "Source", kind: "text", required: false }],
		});
		expect(r.ok && r.id).toBe("recipe");
		const types = await loadTypes(host);
		expect(types.map((t) => t.name)).toEqual([
			"Contact",
			"Book",
			"Article",
			"Recipe",
		]);
		expect(types[3]?.titleLabel).toBe("Dish");
	});

	it("refuses a duplicate or empty type name", async () => {
		const host = await vault();
		expect(
			await addType(host, { name: "contact", titleLabel: "Name" }),
		).toEqual({
			ok: false,
			message: "A type called contact already exists.",
		});
		expect((await addType(host, { name: "  ", titleLabel: "x" })).ok).toBe(
			false,
		);
	});

	it("adds a field, refusing a clash with another field or the title label", async () => {
		const host = await vault();
		const ok = await addField(host, "contact", {
			label: "Pronouns",
			kind: "text",
			required: false,
		});
		expect(ok.ok).toBe(true);
		for (const label of ["phone", "Name"]) {
			const bad = await addField(host, "contact", {
				label,
				kind: "text",
				required: false,
			});
			expect(bad.ok).toBe(false);
		}
	});

	it("makes a field required without touching saved cards", async () => {
		const host = await vault();
		const path = await contact(host, "Mara");
		await setFieldRequired(host, "contact", "Phone", true);
		const [card] = await listCards(host);
		expect(card?.path).toBe(path);
		const type = (await loadTypes(host)).find((t) => t.id === "contact");
		expect(missingRequired(card as never, type ?? null)).toEqual(["Phone"]);
	});

	it("never overwrites a types file it cannot read", async () => {
		const host = await vault();
		await host.makeFolder(".vaultops/resources");
		await host.writeTextAtomic(TYPES_FILE, "{ not json");
		await expect(loadTypes(host)).rejects.toThrow(/could not be read/);
		await expect(
			addType(host, { name: "X", titleLabel: "Name" }),
		).rejects.toThrow();
		expect(await host.readText(TYPES_FILE)).toBe("{ not json");
	});

	it("reads a types file from a newer version as read-only", async () => {
		const host = await vault();
		await host.makeFolder(".vaultops/resources");
		await host.writeTextAtomic(
			TYPES_FILE,
			JSON.stringify({ format: "vaultops-resource-types", v: 9, types: [] }),
		);
		await expect(loadTypes(host)).rejects.toThrow(/newer app version/);
	});
});

describe("resource cards", () => {
	it("creates a card with only a name, as an ordinary note file", async () => {
		const host = await vault();
		const path = await contact(host, "Mara Okafor");
		expect(path).toBe(`${CARDS}/Mara Okafor.vnote`);
		const [card] = await listCards(host);
		expect(card).toMatchObject({ title: "Mara Okafor", typeId: "contact" });
		expect(card?.blocks).toHaveLength(1);
		expect(card?.updated).toBe(NOW.toISOString());
	});

	it("stores field values as typed note properties keyed by label", async () => {
		const host = await vault();
		await contact(host, "Mara", {
			Phone: "+44 20 7946 0113",
			Birthday: "1984-03-12",
		});
		const [card] = await listCards(host);
		expect(card?.props).toEqual({
			Phone: { type: "text", value: "+44 20 7946 0113" },
			Birthday: { type: "date", value: "1984-03-12" },
		});
	});

	it("stores numbers as numbers and refuses text in a number or bad date", async () => {
		const host = await vault();
		const types = await loadTypes(host);
		const book = types.find((t) => t.id === "book");
		if (!book) throw new Error("no book");
		const ok = await createCard(host, book, "Dune", { Year: "1965" }, NOW);
		expect(ok.ok).toBe(true);
		expect((await listCards(host))[0]?.props.Year).toEqual({
			type: "number",
			value: 1965,
		});
		expect(await createCard(host, book, "X", { Year: "soon" }, NOW)).toEqual({
			ok: false,
			message: "Year must be a number.",
		});
		const contactType = types.find((t) => t.id === "contact");
		if (!contactType) throw new Error("no contact");
		expect(
			await createCard(host, contactType, "Y", { Birthday: "31 Feb" }, NOW),
		).toEqual({ ok: false, message: "Birthday must be a date." });
	});

	it("needs the title and every required field, and says which", async () => {
		const host = await vault();
		await setFieldRequired(host, "contact", "Email", true);
		const type = (await loadTypes(host)).find((t) => t.id === "contact");
		if (!type) throw new Error("no contact");
		expect(await createCard(host, type, " ", {}, NOW)).toEqual({
			ok: false,
			message: "Needs: Name, Email.",
		});
		expect((await listCards(host)).length).toBe(0);
	});

	it("gives clashing names their own files", async () => {
		const host = await vault();
		await contact(host, "Sam");
		await contact(host, "sam");
		expect((await listCards(host)).map((c) => c.path).sort()).toEqual([
			`${CARDS}/Sam.vnote`,
			`${CARDS}/sam 2.vnote`,
		]);
	});

	it("edits a card, clears a blank value, and keeps body blocks and unrelated props", async () => {
		const host = await vault();
		const path = await contact(host, "Mara", { Phone: "1", Role: "Editor" });
		const raw = (await host.readText(path)).split("\n");
		const header = JSON.parse(raw[0] ?? "{}");
		header.props.Mood = { type: "text", value: "kept" };
		await host.writeTextAtomic(
			path,
			[JSON.stringify(header), ...raw.slice(1)].join("\n"),
		);
		const type = (await loadTypes(host)).find((t) => t.id === "contact");
		if (!type) throw new Error("no contact");
		const r = await updateCard(
			host,
			path,
			type,
			"Mara O.",
			{ Phone: "", Role: "Senior editor" },
			new Date("2026-11-09T00:00:00Z"),
		);
		expect(r.ok).toBe(true);
		const [card] = await listCards(host);
		expect(card?.title).toBe("Mara O.");
		expect(card?.props).toEqual({
			Role: { type: "text", value: "Senior editor" },
			Mood: { type: "text", value: "kept" },
		});
		expect(card?.blocks).toHaveLength(1);
		expect(card?.updated).toBe("2026-11-09T00:00:00.000Z");
	});

	it("matches field labels ignoring capitals and keeps the stored spelling", () => {
		const type = DEFAULT_TYPES[0];
		if (!type) throw new Error("no type");
		const r = applyValues({ phone: { type: "text", value: "1" } }, type, {
			Phone: "2",
		});
		expect(r).toEqual({
			ok: true,
			props: { phone: { type: "text", value: "2" } },
		});
	});

	it("shows fields in the type's order, extras separately, and counts what is filled", async () => {
		const host = await vault();
		await contact(host, "Mara", { Phone: "1", Email: "m@x" });
		const [card] = await listCards(host);
		const type = (await loadTypes(host))[0];
		if (!card || !type) throw new Error("missing");
		expect(cardFields(card, type).map((f) => f.field.label)).toEqual(
			type.fields.map((f) => f.label),
		);
		expect(completeness(card, type)).toEqual({ filled: 3, total: 8 });
		expect(cardExtras(card, type)).toEqual([]);
		expect(cardExtras(card, null).map((e) => e.name)).toEqual([
			"Email",
			"Phone",
		]);
	});

	it("lists a file it cannot read with a problem, never hiding it", async () => {
		const host = await vault();
		await host.makeFolder(CARDS);
		await host.writeTextAtomic(`${CARDS}/Broken.vnote`, "nonsense");
		const [card] = await listCards(host);
		expect(card?.title).toBe("Broken");
		expect(card?.problem).toMatch(/could not be read/);
		await expect(
			setCardType(host, `${CARDS}/Broken.vnote`, null),
		).rejects.toThrow();
		expect(await host.readText(`${CARDS}/Broken.vnote`)).toBe("nonsense");
	});

	it("removing a card moves it to the recovery folder", async () => {
		const host = await vault();
		const path = await contact(host, "Mara");
		await removeCard(host, path, NOW);
		expect(await host.kindOf(path)).toBeNull();
		expect(await recoveryFiles(host)).toEqual([
			".vaultops/recovery/2026-11-08T12-00-00-000Z/resources/cards/Mara.vnote",
		]);
	});

	it("finds cards by title or any value, every word", async () => {
		const host = await vault();
		await contact(host, "Mara Okafor", { Organization: "Halden Press" });
		await contact(host, "Jonas Weil", { Role: "Typographer" });
		const cards = await listCards(host);
		expect(searchCards(cards, "halden").map((c) => c.title)).toEqual([
			"Mara Okafor",
		]);
		expect(searchCards(cards, "jonas typo").map((c) => c.title)).toEqual([
			"Jonas Weil",
		]);
		expect(searchCards(cards, "")).toHaveLength(2);
		expect(searchCards(cards, "nobody")).toHaveLength(0);
	});
});

describe("guided removal", () => {
	it("removing a field keeps the values on cards as extras", async () => {
		const host = await vault();
		await contact(host, "Mara", { Phone: "1" });
		await contact(host, "Jonas");
		expect(await countValues(host, "contact", "Phone")).toEqual({
			cards: 2,
			withValue: 1,
		});
		const r = await removeField(host, "contact", "Phone");
		expect(r.removedValues).toBe(0);
		const types = await loadTypes(host);
		const type = types.find((t) => t.id === "contact");
		expect(type?.fields.some((f) => f.label === "Phone")).toBe(false);
		const mara = (await listCards(host)).find((c) => c.title === "Mara");
		expect(cardExtras(mara as never, type ?? null)).toEqual([
			{ name: "Phone", value: "1" },
		]);
		expect(await recoveryFiles(host)).toEqual([]);
	});

	it("removing a field and its values copies each changed card to recovery first", async () => {
		const host = await vault();
		const path = await contact(host, "Mara", { Phone: "1", Role: "Editor" });
		const before = await host.readText(path);
		await contact(host, "Jonas");
		const r = await removeField(host, "contact", "Phone", {
			alsoValues: true,
			now: NOW,
		});
		expect(r.removedValues).toBe(1);
		const mara = (await listCards(host)).find((c) => c.title === "Mara");
		expect(mara?.props).toEqual({ Role: { type: "text", value: "Editor" } });
		const files = await recoveryFiles(host);
		expect(files).toEqual([
			".vaultops/recovery/2026-11-08T12-00-00-000Z/resources/cards/Mara.vnote",
		]);
		expect(await host.readText(files[0] as string)).toBe(before);
	});

	it("deleting a type keeps its cards without a type and every value", async () => {
		const host = await vault();
		const path = await contact(host, "Mara", { Phone: "1" });
		const r = await deleteType(host, "contact", { now: NOW });
		expect(r.cards).toBe(1);
		expect((await loadTypes(host)).map((t) => t.id)).toEqual([
			"book",
			"article",
		]);
		const [card] = await listCards(host);
		expect(card?.path).toBe(path);
		expect(card?.typeId).toBeNull();
		expect(cardExtras(card as never, null)).toEqual([
			{ name: "Phone", value: "1" },
		]);
		const files = await recoveryFiles(host);
		expect(files).toEqual([
			".vaultops/recovery/2026-11-08T12-00-00-000Z/resources/types.json",
		]);
		expect(
			JSON.parse(await host.readText(files[0] as string)).types,
		).toHaveLength(3);
	});

	it("deleting a type can move its cards to another type, matching fields by name", async () => {
		const host = await vault();
		await contact(host, "Mara", { Notes: "Prefers email", Phone: "1" });
		await addType(host, {
			name: "Person",
			titleLabel: "Name",
			fields: [{ label: "notes", kind: "long", required: false }],
		});
		await deleteType(host, "contact", { moveTo: "person", now: NOW });
		const types = await loadTypes(host);
		const person = types.find((t) => t.id === "person");
		const [card] = await listCards(host);
		expect(card?.typeId).toBe("person");
		expect(cardFields(card as never, person as never)[0]?.value).toBe(
			"Prefers email",
		);
		expect(cardExtras(card as never, person ?? null)).toEqual([
			{ name: "Phone", value: "1" },
		]);
	});

	it("refuses to move cards to the type being deleted or to one that doesn't exist", async () => {
		const host = await vault();
		await expect(
			deleteType(host, "contact", { moveTo: "contact" }),
		).rejects.toThrow();
		await expect(
			deleteType(host, "contact", { moveTo: "ghost" }),
		).rejects.toThrow();
		expect((await loadTypes(host)).length).toBe(3);
	});

	it("gives a typeless card a type later", async () => {
		const host = await vault();
		const path = await contact(host, "Mara", { Phone: "1" });
		await deleteType(host, "contact", { now: NOW });
		await addType(host, {
			name: "Contact",
			titleLabel: "Name",
			fields: [{ label: "Phone", kind: "text", required: false }],
		});
		await setCardType(host, path, "contact", NOW);
		const type = (await loadTypes(host)).find((t) => t.id === "contact");
		const [card] = await listCards(host);
		expect(card?.typeId).toBe("contact");
		expect(
			cardFields(card as never, type as never).find(
				(f) => f.field.label === "Phone",
			)?.value,
		).toBe("1");
	});
});

describe("neutrality", () => {
	it("resource files stay out of the vault scan, the tree and health", async () => {
		const host = await vault();
		await contact(host, "Mara");
		await addType(host, { name: "Recipe", titleLabel: "Dish" });
		const scan = await scanVault(host);
		expect(scan.notes).toEqual([]);
		expect(scan.report).toEqual([]);
		expect(scan.folders).toEqual([]);
	});
});

describe("fixtures", () => {
	it("reads the documented card and types files", async () => {
		const host = await vault();
		await host.makeFolder(CARDS);
		await host.writeTextAtomic(
			`${CARDS}/Mara Okafor.vnote`,
			readFileSync("test-fixtures/resource-card.vnote", "utf8"),
		);
		await host.writeTextAtomic(
			TYPES_FILE,
			readFileSync("test-fixtures/resource-types.json", "utf8"),
		);
		const types = await loadTypes(host);
		const [card] = await listCards(host);
		const type = types[0];
		if (!card || !type) throw new Error("fixture not read");
		expect(card).toMatchObject({
			title: "Mara Okafor",
			typeId: "contact",
			updated: "2026-11-08T12:00:00.000Z",
		});
		expect(cardFields(card, type).map((f) => f.value)).toEqual([
			"+44 20 7946 0113",
			"1984-03-12",
			"",
		]);
		expect(missingRequired(card, type)).toEqual(["Email"]);
		expect(cardExtras(card, type)).toEqual([
			{ name: "Mood", value: "kept as an extra property" },
		]);
	});

	it("loads a v1 file and saves it back byte for byte", async () => {
		const host = await vault();
		const text = V1_FILE;
		await host.makeFolder(RESOURCES);
		await host.writeTextAtomic(TYPES_FILE, text);
		const types = await loadTypes(host);
		await setFieldRequired(host, "contact", "Email", true);
		expect(await host.readText(TYPES_FILE)).toBe(text);
		expect(types.map((t) => t.id)).toEqual(["contact", "book"]);
	});

	it("reads a v2 file and writes it back unchanged", async () => {
		const host = await vault();
		const text = V2_FILE;
		await host.makeFolder(RESOURCES);
		await host.writeTextAtomic(TYPES_FILE, text);
		const [book] = await loadTypes(host);
		expect(book).toMatchObject({
			icon: "book",
			folder: "Books",
			template: "Book review.vnote",
		});
		expect(book?.fields[1]).toMatchObject({
			kind: "select",
			options: ["To read", "Reading", "Done"],
		});
		await setFieldRequired(host, "book", "Author", false);
		expect(await host.readText(TYPES_FILE)).toBe(text);
	});

	it("stays v1 until a v2 feature is used, then becomes v2", async () => {
		const host = await vault();
		await addType(host, { name: "Film", titleLabel: "Title" });
		expect(JSON.parse(await host.readText(TYPES_FILE)).v).toBe(1);
		await addField(host, "film", {
			label: "Seen",
			kind: "select",
			required: false,
			options: [" Yes ", "No", "Yes", ""],
		});
		const saved = JSON.parse(await host.readText(TYPES_FILE));
		expect(saved.v).toBe(2);
		expect(saved.types.at(-1).fields[0].options).toEqual(["Yes", "No"]);
		await updateType(host, "film", { folder: "Films", icon: "film" });
		expect((await loadTypes(host)).at(-1)).toMatchObject({
			folder: "Films",
			icon: "film",
		});
		await updateType(host, "film", { folder: null, icon: null });
		expect((await loadTypes(host)).at(-1)).not.toHaveProperty("folder");
	});

	it("refuses a folder outside the vault and unusable v2 keys", async () => {
		const host = await vault();
		expect((await updateType(host, "book", { folder: "../x" })).ok).toBe(false);
		expect((await updateType(host, "book", { folder: "/abs" })).ok).toBe(false);
		for (const extra of [{ folder: "a/../b" }, { icon: 3 }, { template: "" }]) {
			await host.makeFolder(RESOURCES);
			await host.writeTextAtomic(
				TYPES_FILE,
				JSON.stringify({
					format: "vaultops-resource-types",
					v: 2,
					types: [
						{ id: "a", name: "A", titleLabel: "T", fields: [], ...extra },
					],
				}),
			);
			await expect(loadTypes(host)).rejects.toThrow();
		}
	});

	it("writes select, checkbox and list values from the card form", () => {
		const type = {
			id: "t",
			name: "T",
			titleLabel: "Title",
			fields: [
				{
					label: "S",
					kind: "select" as const,
					required: false,
					options: ["a", "b"],
				},
				{ label: "C", kind: "checkbox" as const, required: false },
				{ label: "L", kind: "list" as const, required: false },
			],
		};
		const r = applyValues({}, type, { S: "a", C: "Yes", L: "x, y" });
		expect(r).toEqual({
			ok: true,
			props: {
				S: { type: "select", value: "a", options: ["a", "b"] },
				C: { type: "checkbox", value: true },
				L: { type: "list", value: ["x", "y"] },
			},
		});
		// A note's own options are kept when the value changes.
		const own = { S: { type: "select", value: "z", options: ["z"] } };
		expect(applyValues(own, type, { S: "a" })).toEqual({
			ok: true,
			props: { S: { type: "select", value: "a", options: ["z"] } },
		});
	});
});
