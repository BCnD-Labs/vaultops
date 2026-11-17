// @vitest-environment happy-dom
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
	createCard,
	listCards,
	loadTypes,
	TYPES_FILE,
} from "../core/resources/resources";
import { openVault } from "../core/vault/vault";
import { MemoryHost } from "../host/memory-host";
import { ResourceManager } from "./ResourceManager";
import { TypeRemovalDialog } from "./resources/RemoveDialogs";

// Radix Select needs pointer-capture and scrolling APIs that happy-dom lacks.
Object.assign(Element.prototype, {
	hasPointerCapture: () => false,
	setPointerCapture: () => {},
	releasePointerCapture: () => {},
	scrollIntoView: () => {},
});

const notify = vi.hoisted(() => vi.fn());
vi.mock("../ui/notify", () => ({ notify }));

afterEach(() => {
	cleanup();
	notify.mockReset();
});

async function setup(
	seed: (host: MemoryHost) => Promise<void> = async () => {},
	writable = true,
) {
	const host = new MemoryHost();
	await openVault(host);
	await seed(host);
	const onClose = vi.fn();
	render(
		<ResourceManager host={host} writable={writable} open onClose={onClose} />,
	);
	return { host, onClose };
}

const user = () => userEvent.setup();

async function addContact(
	host: MemoryHost,
	name: string,
	values: Record<string, string> = {},
) {
	const type = (await loadTypes(host)).find((t) => t.id === "contact");
	if (!type) throw new Error("no contact type");
	const r = await createCard(host, type, name, values);
	if (!r.ok) throw new Error(r.message);
}

it("lists the built-in types with counts and the cards of a type", async () => {
	await setup(async (host) => {
		await addContact(host, "Mara Okafor", { Organization: "Halden Press" });
		await addContact(host, "Jonas Weil");
	});
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	expect(within(nav).getByRole("button", { name: /^All\s*2$/ })).toBeTruthy();
	expect(
		within(nav).getByRole("button", { name: /^Contact\s*2$/ }),
	).toBeTruthy();
	expect(within(nav).getByRole("button", { name: /^Book\s*0$/ })).toBeTruthy();
	expect(screen.getByText("Mara Okafor")).toBeTruthy();
	expect(screen.getByText("Halden Press")).toBeTruthy();
});

it("adds a card with only a name and saves it as a file under Resources", async () => {
	const u = user();
	const { host } = await setup();
	await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(screen.getByRole("button", { name: /New resource/ }));
	await u.click(screen.getByRole("button", { name: /^Contact\s*Needs only/ }));
	const save = screen.getByRole("button", { name: "Save card" });
	expect(save).toHaveProperty("disabled", true);
	expect(screen.getByText("Needs: Name.")).toBeTruthy();
	await u.type(screen.getByLabelText(/^Name/), "Priya Raman");
	expect(save).toHaveProperty("disabled", false);
	await u.click(save);
	expect(
		await screen.findByRole("article", { name: "Resource card" }),
	).toBeTruthy();
	expect(notify).toHaveBeenCalledWith(
		'Saved "Priya Raman". It lives in Resources, not in the Notes tree.',
	);
	expect(screen.queryByRole("status")).toBeNull();
	expect((await listCards(host)).map((c) => c.title)).toEqual(["Priya Raman"]);
});

it("keeps optional fields behind 'Add more details' until asked", async () => {
	const u = user();
	await setup();
	await u.click(await screen.findByRole("button", { name: /New resource/ }));
	await u.click(screen.getByRole("button", { name: /^Book\s*Needs only/ }));
	expect(screen.queryByLabelText(/^Author/)).toBeNull();
	await u.click(screen.getByRole("button", { name: /Add more details/ }));
	expect(screen.getByLabelText(/^Author/)).toBeTruthy();
});

it("blocks saving until a required field is filled, naming it", async () => {
	const u = user();
	const { host } = await setup(async (h) => {
		const { setFieldRequired } = await import("../core/resources/resources");
		await setFieldRequired(h, "contact", "Email", true);
	});
	await u.click(await screen.findByRole("button", { name: /New resource/ }));
	await u.click(screen.getByRole("button", { name: /^Contact\s*Needs only/ }));
	await u.type(screen.getByLabelText(/^Name/), "Sam");
	expect(screen.getByText("Needs: Email.")).toBeTruthy();
	expect(screen.getByRole("button", { name: "Save card" })).toHaveProperty(
		"disabled",
		true,
	);
	await u.type(screen.getByLabelText(/^Email/), "sam@x.example");
	await u.click(screen.getByRole("button", { name: "Save card" }));
	await waitFor(async () => expect((await listCards(host)).length).toBe(1));
});

it("asks before dropping what was typed", async () => {
	const u = user();
	const { host } = await setup(async (h) => addContact(h, "Mara"));
	await u.click(await screen.findByRole("button", { name: /Mara/ }));
	await u.click(screen.getByRole("button", { name: "Edit" }));
	await u.type(screen.getByLabelText(/^Phone/), "123");
	await u.click(screen.getByRole("button", { name: "Cancel" }));
	expect(await screen.findByText("Discard what you typed?")).toBeTruthy();
	await u.click(screen.getByRole("button", { name: "Keep editing" }));
	expect((screen.getByLabelText(/^Phone/) as HTMLInputElement).value).toBe(
		"123",
	);
	await u.click(screen.getByRole("button", { name: "Cancel" }));
	await u.click(await screen.findByRole("button", { name: "Discard" }));
	expect((await listCards(host))[0]?.props).toEqual({});
});

it("removing a field keeps the values and shows them as extra properties", async () => {
	const u = user();
	await setup(async (h) => addContact(h, "Mara", { Phone: "555 0100" }));
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: "Remove Phone" }));
	expect(await screen.findByText(/1 card has a value/)).toBeTruthy();
	await u.click(screen.getByRole("button", { name: "Remove field" }));
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			'Removed "Phone". 1 card kept the value as an extra property.',
		),
	);
	await u.click(screen.getByRole("button", { name: "Done" }));
	await u.click(await screen.findByRole("button", { name: /Mara/ }));
	expect(screen.getByText("Extra properties")).toBeTruthy();
	expect(screen.getByText("555 0100")).toBeTruthy();
});

it("deleting a type keeps its cards as 'No type' and lets you give them a type again", async () => {
	const u = user();
	const { host } = await setup(async (h) =>
		addContact(h, "Mara", { Phone: "1" }),
	);
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: "Delete type" }));
	expect(await screen.findByText(/Delete the Contact type\?/)).toBeTruthy();
	const dialog = screen.getByRole("dialog", {
		name: /Delete the Contact type/,
	});
	await u.click(within(dialog).getByRole("button", { name: "Delete type" }));
	await waitFor(() =>
		expect(
			within(
				screen.getByRole("navigation", { name: "Resource types" }),
			).getByRole("button", { name: /^No type\s*1$/ }),
		).toBeTruthy(),
	);
	await u.click(screen.getByRole("button", { name: /Mara/ }));
	await u.click(screen.getByRole("button", { name: "Make it a Book" }));
	await waitFor(async () =>
		expect((await listCards(host))[0]?.typeId).toBe("book"),
	);
});

it("adds a custom type and goes straight to its first card", async () => {
	const u = user();
	const { host } = await setup();
	await u.click(await screen.findByRole("button", { name: "+ Add type" }));
	const dialog = await screen.findByRole("dialog", { name: "Add a type" });
	const create = within(dialog).getByRole("button", { name: "Create type" });
	expect(create).toHaveProperty("disabled", true);
	await u.type(within(dialog).getByLabelText("Type name"), "Recipe");
	await u.click(create);
	expect(await screen.findByText("New Recipe")).toBeTruthy();
	expect((await loadTypes(host)).map((t) => t.name)).toContain("Recipe");
});

it("builds the starter toggles and the disabled Create type from the Button", async () => {
	const u = user();
	await setup();
	await u.click(await screen.findByRole("button", { name: "+ Add type" }));
	const dialog = await screen.findByRole("dialog", { name: "Add a type" });
	const starters = within(dialog).getByRole("group", {
		name: "Optional fields to start with",
	});
	const toggle = within(starters).getAllByRole("button")[0] as HTMLElement;
	expect(toggle.getAttribute("data-slot")).toBe("button");
	// Pressed keeps the outline variant: the Button shows its own selected look.
	const before = toggle.getAttribute("aria-pressed");
	expect(["true", "false"]).toContain(before);
	expect(toggle.getAttribute("data-variant")).toBe("outline");
	await u.click(toggle);
	expect(toggle.getAttribute("aria-pressed")).toBe(
		before === "true" ? "false" : "true",
	);
	expect(toggle.getAttribute("data-variant")).toBe("outline");
	const create = within(dialog).getByRole("button", { name: "Create type" });
	expect(create.getAttribute("data-slot")).toBe("button");
	expect(create).toHaveProperty("disabled", true);
});

it("refuses a type name that already exists", async () => {
	const u = user();
	await setup();
	await u.click(await screen.findByRole("button", { name: "+ Add type" }));
	const dialog = await screen.findByRole("dialog", { name: "Add a type" });
	await u.type(within(dialog).getByLabelText("Type name"), "book");
	expect(
		within(dialog).getByText("A type called book already exists."),
	).toBeTruthy();
	expect(
		within(dialog).getByRole("button", { name: "Create type" }),
	).toHaveProperty("disabled", true);
});

it("searches names and values across all types", async () => {
	const u = user();
	await setup(async (h) => {
		await addContact(h, "Mara Okafor", { Organization: "Halden Press" });
		await addContact(h, "Jonas Weil");
	});
	await screen.findByText("Jonas Weil");
	await u.type(screen.getByLabelText("Search resources"), "halden");
	expect(screen.queryByText("Jonas Weil")).toBeNull();
	expect(screen.getAllByText("Mara Okafor").length).toBeGreaterThan(0);
	await u.clear(screen.getByLabelText("Search resources"));
	await u.type(screen.getByLabelText("Search resources"), "zzz");
	expect(await screen.findByText(/No cards match "zzz"/)).toBeTruthy();
});

it("removing a card asks first and keeps the file in recovery", async () => {
	const u = user();
	const { host } = await setup(async (h) => addContact(h, "Mara"));
	await u.click(await screen.findByRole("button", { name: /Mara/ }));
	await u.click(screen.getByRole("button", { name: "Remove card" }));
	expect(await screen.findByText("Remove this card?")).toBeTruthy();
	await u.click(screen.getByRole("button", { name: "Cancel" }));
	expect((await listCards(host)).length).toBe(1);
	await u.click(screen.getByRole("button", { name: "Remove card" }));
	await u.click(
		await screen.findByRole("button", { name: "Remove card", hidden: false }),
	);
	await waitFor(async () => expect((await listCards(host)).length).toBe(0));
	expect(notify).toHaveBeenCalledWith(
		'Removed "Mara". It is in the recovery folder.',
	);
});

it("is view-only in a read-only vault and when the types file is unreadable", async () => {
	await setup(async (h) => addContact(h, "Mara"), false);
	expect((await screen.findByText(/read-only/)).textContent).toBeTruthy();
	expect(screen.getByRole("button", { name: /New resource/ })).toHaveProperty(
		"disabled",
		true,
	);
	cleanup();
	await setup(async (h) => {
		await h.makeFolder(".vaultops/resources");
		await h.writeTextAtomic(TYPES_FILE, "{ nope");
	});
	expect((await screen.findByRole("alert")).textContent).toMatch(
		/could not be read/,
	);
});

it("shows the notes and canvases that mention a card, and opens one", async () => {
	const u = user();
	const onOpenNote = vi.fn();
	const host = new MemoryHost();
	await openVault(host);
	await addContact(host, "Sam Rivera");
	const card = (await listCards(host))[0];
	if (!card) throw new Error("no card");
	const mention = (id: string, title: string, extra = "") =>
		`${JSON.stringify({ format: "vaultops-note", v: 1, noteId: id, title, ...(extra ? { kind: extra } : {}) })}\n${JSON.stringify({ id: `${id}-b`, type: "paragraph", parent: null, content: [{ type: "noteLink", attrs: { kind: "resource", target: card.noteId, label: "Sam Rivera" } }] })}\n`;
	await host.writeTextAtomic("Trip.vnote", mention("trip", "Trip"));
	await host.writeTextAtomic(
		"Ideas.vnote",
		mention("ideas", "Ideas", "canvas"),
	);
	render(
		<ResourceManager
			host={host}
			writable
			open
			onClose={vi.fn()}
			focusId={card.noteId}
			onOpenNote={onOpenNote}
		/>,
	);
	const article = await screen.findByRole("article", {
		name: "Resource card",
	});
	expect(
		within(article).getByRole("heading", { name: "Sam Rivera" }),
	).toBeTruthy();
	await u.click(
		await within(article).findByRole("button", { name: "Ideas (canvas)" }),
	);
	expect(onOpenNote).toHaveBeenCalledWith("Ideas.vnote");
	expect(within(article).getByRole("button", { name: "Trip" })).toBeTruthy();
});

it("tells you how to link a card that nothing mentions yet", async () => {
	await setup(async (host) => {
		await addContact(host, "Jonas Weil");
	});
	const u = user();
	await u.click(await screen.findByRole("button", { name: /Jonas Weil/ }));
	expect(await screen.findByText(/type @ and pick/)).toBeTruthy();
});

it("warns, before a card is removed, that notes mention it", async () => {
	const u = user();
	const host = new MemoryHost();
	await openVault(host);
	await addContact(host, "Sam Rivera");
	const card = (await listCards(host))[0];
	if (!card) throw new Error("no card");
	await host.writeTextAtomic(
		"Trip.vnote",
		`${JSON.stringify({ format: "vaultops-note", v: 1, noteId: "trip", title: "Trip" })}\n${JSON.stringify({ id: "b", type: "paragraph", parent: null, content: [{ type: "noteLink", attrs: { kind: "resource", target: card.noteId, label: "Sam Rivera" } }] })}\n`,
	);
	render(
		<ResourceManager
			host={host}
			writable
			open
			onClose={vi.fn()}
			focusId={card.noteId}
		/>,
	);
	await screen.findByRole("button", { name: "Trip" });
	await u.click(screen.getByRole("button", { name: "Remove card" }));
	const dialog = await screen.findByRole("alertdialog");
	expect(dialog.textContent).toContain("1 note or canvas mentions it (Trip)");
	expect(dialog.textContent).toContain("nothing in the notes is changed");
});

it("adds a field from a type's settings and lists it", async () => {
	const u = user();
	await setup();
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: /Add field/ }));
	await u.type(await screen.findByLabelText("Field name"), "Pronouns");
	await u.click(screen.getByRole("button", { name: "Add field" }));
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining('Added "Pronouns" to Contact'),
		),
	);
	expect(screen.getByRole("button", { name: "Remove Pronouns" })).toBeTruthy();
});

it("shows an inline hint and blocks a field name the type already has", async () => {
	const u = user();
	await setup();
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: /Add field/ }));
	await u.type(await screen.findByLabelText("Field name"), "phone");
	expect(
		screen.getByText("Contact already has a field called phone."),
	).toBeTruthy();
	expect(screen.getByRole("button", { name: "Add field" })).toHaveProperty(
		"disabled",
		true,
	);
});

it("edits an existing card, saves it and shows the new value", async () => {
	const u = user();
	const { host } = await setup(async (h) =>
		addContact(h, "Mara", { Phone: "555 0100" }),
	);
	await u.click(await screen.findByRole("button", { name: /Mara/ }));
	await u.click(screen.getByRole("button", { name: "Edit" }));
	const phone = screen.getByLabelText(/^Phone/);
	await u.clear(phone);
	await u.type(phone, "555 0199");
	await u.click(screen.getByRole("button", { name: "Save changes" }));
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith('Saved changes to "Mara".'),
	);
	const article = await screen.findByRole("article", { name: "Resource card" });
	expect(within(article).getByText("555 0199")).toBeTruthy();
	expect(within(article).queryByText("555 0100")).toBeNull();
	expect(JSON.stringify((await listCards(host))[0]?.props)).toContain(
		"555 0199",
	);
});

it("blocks saving a link field with a bad link and shows the problem", async () => {
	const u = user();
	const { host } = await setup();
	await u.click(await screen.findByRole("button", { name: /New resource/ }));
	await u.click(screen.getByRole("button", { name: /^Article\s*Needs only/ }));
	await u.type(screen.getByLabelText(/^Title/), "Field notes");
	await u.click(screen.getByRole("button", { name: /Add more details/ }));
	const save = screen.getByRole("button", { name: "Save card" });
	expect(save).toHaveProperty("disabled", false);
	await u.type(screen.getByLabelText(/^Link/), "example.com");
	expect(
		await screen.findByText(
			"Start the link with https:// (or http://, mailto: or tel:).",
		),
	).toBeTruthy();
	expect(save).toHaveProperty("disabled", true);
	expect((await listCards(host)).length).toBe(0);
	await u.clear(screen.getByLabelText(/^Link/));
	await u.type(screen.getByLabelText(/^Link/), "https://example.com");
	expect(save).toHaveProperty("disabled", false);
});

it("deleting a type can move its cards to another type", async () => {
	const u = user();
	const { host } = await setup(async (h) => addContact(h, "Mara"));
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: "Delete type" }));
	const dialog = await screen.findByRole("dialog", {
		name: /Delete the Contact type/,
	});
	await u.click(
		within(dialog).getByRole("radio", {
			name: /Move the cards to another type/,
		}),
	);
	await u.click(
		within(dialog).getByRole("combobox", { name: "Move cards to" }),
	);
	await u.click(await screen.findByRole("option", { name: "Book" }));
	await u.click(within(dialog).getByRole("button", { name: "Delete type" }));
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining("1 card moved to Book."),
		),
	);
	const cards = await listCards(host);
	expect(cards.map((c) => c.typeId)).toEqual(["book"]);
	expect((await loadTypes(host)).map((t) => t.id)).not.toContain("contact");
});

it("removing a field with its values drops the value and keeps a recovery copy", async () => {
	const u = user();
	const { host } = await setup(async (h) =>
		addContact(h, "Mara", { Phone: "555 0100" }),
	);
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: "Remove Phone" }));
	const dialog = await screen.findByRole("dialog", {
		name: /Remove "Phone" from Contact/,
	});
	await u.click(
		within(dialog).getByRole("radio", { name: /Remove the values too/ }),
	);
	await u.click(within(dialog).getByRole("button", { name: "Remove field" }));
	await waitFor(() =>
		expect(notify).toHaveBeenCalledWith(
			expect.stringContaining(
				"1 value removed; copies are in the recovery folder.",
			),
		),
	);
	await u.click(screen.getByRole("button", { name: "Done" }));
	await u.click(await screen.findByRole("button", { name: /Mara/ }));
	const article = await screen.findByRole("article", { name: "Resource card" });
	expect(within(article).queryByText("555 0100")).toBeNull();
	expect(within(article).queryByText("Extra properties")).toBeNull();
	expect((await listCards(host))[0]?.props).toEqual({});
	// The card as it was before the value went is kept under the recovery folder.
	const stamps = await host.list(".vaultops/recovery");
	expect(stamps.length).toBe(1);
	const copies = await host.list(
		`.vaultops/recovery/${stamps[0]?.name}/resources/cards`,
	);
	expect(copies.length).toBe(1);
	expect(
		await host.readText(
			`.vaultops/recovery/${stamps[0]?.name}/resources/cards/${copies[0]?.name}`,
		),
	).toContain("555 0100");
});

it("shows Loading resources… until the first list arrives", async () => {
	const host = new MemoryHost();
	await openVault(host);
	let release: () => void = () => {};
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const list = host.list.bind(host);
	vi.spyOn(host, "list").mockImplementation(async (path) => {
		await gate;
		return list(path);
	});
	render(<ResourceManager host={host} writable open onClose={() => {}} />);
	expect(screen.getByText("Loading resources…")).toBeTruthy();
	release();
	await screen.findByRole("navigation", { name: "Resource types" });
	await waitFor(() =>
		expect(screen.queryByText("Loading resources…")).toBeNull(),
	);
	expect(screen.getByText("No cards here yet.")).toBeTruthy();
});

it("keeps a failed save inline as an alert and does not toast it", async () => {
	const u = user();
	const { host } = await setup(async (h) => addContact(h, "Mara"));
	await u.click(await screen.findByRole("button", { name: /Mara/ }));
	await u.click(screen.getByRole("button", { name: "Edit" }));
	await u.type(screen.getByLabelText(/^Phone/), "555");
	vi.spyOn(host, "writeTextAtomic").mockRejectedValue(new Error("disk full"));
	await u.click(screen.getByRole("button", { name: "Save changes" }));
	const alert = await screen.findByRole("alert");
	expect(alert.textContent).toContain("disk full");
	expect(notify).not.toHaveBeenCalled();
});

it("moves between the removal choices with the arrow keys", async () => {
	const u = user();
	await setup(async (h) => addContact(h, "Mara", { Phone: "555 0100" }));
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await u.click(within(nav).getByRole("button", { name: /^Contact/ }));
	await u.click(screen.getByRole("button", { name: "Edit type and fields" }));
	await u.click(screen.getByRole("button", { name: "Remove Phone" }));
	const dialog = await screen.findByRole("dialog", {
		name: /Remove "Phone" from Contact/,
	});
	const group = within(dialog).getByRole("radiogroup", {
		name: "What happens to the values",
	});
	const keep = within(group).getByRole("radio", { name: /Keep the values/ });
	const drop = within(group).getByRole("radio", {
		name: /Remove the values too/,
	});
	expect(keep.getAttribute("aria-checked")).toBe("true");
	keep.focus();
	// Radix moves focus on a timer and only checks it while the key is held.
	await u.keyboard("{ArrowDown>}");
	await waitFor(() => expect(drop.getAttribute("aria-checked")).toBe("true"));
	await u.keyboard("{/ArrowDown}");
	expect(keep.getAttribute("aria-checked")).toBe("false");
	await u.keyboard("{ArrowUp>}");
	await waitFor(() => expect(keep.getAttribute("aria-checked")).toBe("true"));
	await u.keyboard("{/ArrowUp}");
});

it("keeps Delete type disabled until a target type is picked", async () => {
	const u = user();
	const types = await loadTypes(
		await (async () => {
			const host = new MemoryHost();
			await openVault(host);
			return host;
		})(),
	);
	const onConfirm = vi.fn();
	render(
		<TypeRemovalDialog
			removal={{ typeId: "contact", cards: 2, choice: "move", target: "" }}
			types={types}
			onChange={() => {}}
			onCancel={() => {}}
			onConfirm={onConfirm}
		/>,
	);
	const dialog = await screen.findByRole("dialog");
	const del = within(dialog).getByRole("button", { name: "Delete type" });
	expect(del).toHaveProperty("disabled", true);
	cleanup();
	render(
		<TypeRemovalDialog
			removal={{ typeId: "contact", cards: 2, choice: "move", target: "book" }}
			types={types}
			onChange={() => {}}
			onCancel={() => {}}
			onConfirm={onConfirm}
		/>,
	);
	const again = within(await screen.findByRole("dialog")).getByRole("button", {
		name: "Delete type",
	});
	expect(again).toHaveProperty("disabled", false);
	await u.click(again);
	expect(onConfirm).toHaveBeenCalled();
});

it("shows a long field as a textarea and saves what is typed", async () => {
	const u = user();
	const { host } = await setup();
	await u.click(await screen.findByRole("button", { name: /New resource/ }));
	await u.click(screen.getByRole("button", { name: /^Contact\s*Needs only/ }));
	await u.type(screen.getByLabelText(/^Name/), "Priya");
	await u.click(screen.getByRole("button", { name: /Add more details/ }));
	const notes = screen.getByLabelText(/^Notes/);
	expect(notes.tagName).toBe("TEXTAREA");
	expect(notes.getAttribute("data-slot")).toBe("textarea");
	await u.type(notes, "Met at the fair");
	await u.click(screen.getByRole("button", { name: "Save card" }));
	await waitFor(async () =>
		expect((await listCards(host))[0]?.props.Notes).toEqual({
			type: "text",
			value: "Met at the fair",
		}),
	);
});

const tabStops = (root: HTMLElement) =>
	Array.from(root.querySelectorAll<HTMLElement>("button")).filter(
		(b) => b.tabIndex === 0,
	);
const cardRows = () =>
	Array.from(document.querySelectorAll<HTMLElement>(".res-card-row"));

it("makes the type list and the card list one Tab stop each", async () => {
	await setup(async (h) => {
		await addContact(h, "Anna");
		await addContact(h, "Bela");
	});
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	await screen.findByText("Anna");
	expect(tabStops(nav)).toHaveLength(1);
	expect(tabStops(nav)[0]?.textContent).toMatch(/^All/);
	expect(cardRows()).toHaveLength(2);
	expect(tabStops(screen.getByRole("region", { name: "Cards" }))).toEqual(
		cardRows().slice(0, 1),
	);
});

it("moves between cards with arrows without selecting; Enter selects", async () => {
	const u = user();
	await setup(async (h) => {
		await addContact(h, "Anna");
		await addContact(h, "Bela");
		await addContact(h, "Cleo");
	});
	await screen.findByText("Anna");
	const [first, second, third] = cardRows();
	first?.focus();
	await u.keyboard("{ArrowDown}");
	expect(document.activeElement).toBe(second);
	expect(second?.getAttribute("aria-current")).toBeNull();
	await u.keyboard("{End}");
	expect(document.activeElement).toBe(third);
	await u.keyboard("{Home}");
	expect(document.activeElement).toBe(first);
	await u.keyboard("{ArrowDown}{Enter}");
	expect(second?.getAttribute("aria-current")).toBe("true");
	expect(second?.tabIndex).toBe(0);
	expect(first?.tabIndex).toBe(-1);
});

it("moves between types with arrows and leaves the search box alone", async () => {
	const u = user();
	await setup();
	const nav = await screen.findByRole("navigation", { name: "Resource types" });
	const all = within(nav).getByRole("button", { name: /^All/ });
	all.focus();
	await u.keyboard("{ArrowDown}");
	expect(document.activeElement).toBe(
		within(nav).getByRole("button", { name: /^Recent/ }),
	);
	expect(all.getAttribute("aria-current")).toBe("true");
	const search = screen.getByLabelText("Search resources");
	await u.click(search);
	await u.keyboard("{ArrowDown}{End}");
	expect(document.activeElement).toBe(search);
});

it("puts focus on the next card after removing one", async () => {
	const u = user();
	await setup(async (h) => {
		await addContact(h, "Anna");
		await addContact(h, "Bela");
	});
	await screen.findByText("Anna");
	const [first, second] = cardRows();
	await u.click(first as HTMLElement);
	await u.click(screen.getByRole("button", { name: "Remove card" }));
	await u.click(
		await screen.findByRole("button", { name: "Remove card", hidden: false }),
	);
	await waitFor(() => expect(cardRows()).toHaveLength(1));
	await waitFor(() => expect(document.activeElement).toBe(cardRows()[0]));
	expect(cardRows()[0]?.textContent).toContain(
		second?.textContent?.slice(1, 5) ?? "",
	);
});
