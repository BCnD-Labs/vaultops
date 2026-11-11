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

afterEach(cleanup);

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
	expect(screen.getByRole("status").textContent).toContain(
		"not in the Notes tree",
	);
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
		expect(screen.getByRole("status").textContent).toContain(
			"kept the value as an extra property",
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
