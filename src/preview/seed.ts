import { type Block, serializeNote } from "../core/note-format";
import type { Props } from "../core/notes/properties";
import { createNote } from "../core/notes/repository";
import { trashNote } from "../core/notes/trash";
import { openVault } from "../core/vault/vault";
import { MemoryHost } from "../host/memory-host";

const text = (
	id: string,
	value: string,
	type = "paragraph",
	parent: string | null = null,
): Block => ({ id, type, parent, content: [{ type: "text", text: value }] });

/** A fresh, disposable vault each time; all writes stay in memory. */
export async function seedVault(): Promise<MemoryHost> {
	const host = new MemoryHost();
	await openVault(host);
	await host.makeFolder("Class/Week 1");
	await host.makeFolder("Projects");

	async function note(
		folder: string,
		title: string,
		blocks: Block[],
		props: Props = {},
	) {
		const made = await createNote(host, folder, title, { blocks });
		await host.writeTextAtomic(
			made.path,
			serializeNote({
				...made.note,
				header: { ...made.note.header, props },
			}),
		);
		return made.path;
	}

	await note(
		"",
		"A welcome to your sample vault",
		[
			{
				...text("welcome", "A place for ideas", "heading"),
				attrs: { level: 2 },
			},
			text(
				"intro",
				"Explore the folders, tags, properties, trash and vault health. Edit anything here; reloading the page resets this sample vault.",
			),
			{ id: "rule", type: "divider", parent: null },
			{ id: "tip", type: "callout", parent: null, attrs: { tone: "tip" } },
			text(
				"tip-text",
				"Type / to add a callout or a divider.",
				"paragraph",
				"tip",
			),
			{ id: "warn", type: "callout", parent: null, attrs: { tone: "warning" } },
			text(
				"warn-text",
				"Click a callout's icon to change its type.",
				"paragraph",
				"warn",
			),
			{ id: "more", type: "toggle", parent: null, attrs: { open: true } },
			text(
				"more-summary",
				"Click the arrow to fold this away",
				"paragraph",
				"more",
			),
			text(
				"more-body",
				"Anything can live inside a toggle.",
				"paragraph",
				"more",
			),
			{ id: "later", type: "toggle", parent: null },
			text("later-summary", "A closed toggle", "paragraph", "later"),
			text("later-body", "Hidden until opened.", "paragraph", "later"),
			text("read", "Read the class notes", "taskBlock"),
			{
				...text("done", "Set up a sample vault", "taskBlock"),
				attrs: { checked: true },
			},
		],
		{ tags: { type: "list", value: ["welcome", "ideas"] } },
	);
	await note(
		"Class/Week 1",
		"Lecture notes",
		[
			{
				...text("heading", "Observation and questions", "heading"),
				attrs: { level: 2 },
			},
			{ id: "list", type: "bulletList", parent: null },
			{ id: "first", type: "listItem", parent: "list" },
			text(
				"first-text",
				"Start with what you can observe.",
				"paragraph",
				"first",
			),
			{ id: "second", type: "listItem", parent: "list" },
			text(
				"second-text",
				"Write down the questions that follow.",
				"paragraph",
				"second",
			),
		],
		{
			tags: { type: "list", value: ["class"] },
			Credits: { type: "number", value: 3 },
		},
	);
	await note("Class/Week 1", "Reading response", [
		text(
			"response",
			"A useful reading response connects an observation to a question. Keep the context close to the idea so that returning to it a week later still makes sense. Describe the evidence, consider another explanation, and leave room for what you do not know yet. ".repeat(
				6,
			),
		),
	]);
	await note(
		"Class/Week 1",
		"Study checklist",
		[
			text("review", "Review lecture notes", "taskBlock"),
			text("write", "Draft the reading response", "taskBlock"),
		],
		{ Due: { type: "date", value: "2026-11-06" } },
	);
	await note(
		"Projects",
		"Code notebook",
		[
			{
				...text(
					"code",
					'const idea = { title: "Small beginnings" };\nconsole.log(idea.title);',
					"codeBlock",
				),
				attrs: { language: "ts" },
			},
		],
		{ tags: { type: "list", value: ["ideas", "code"] } },
	);
	await note(
		"Projects",
		"Launch plan",
		[
			{ id: "steps", type: "orderedList", parent: null },
			{ id: "step-one", type: "listItem", parent: "steps" },
			text("scope", "Choose a small first milestone.", "paragraph", "step-one"),
			{ id: "step-two", type: "listItem", parent: "steps" },
			text("feedback", "Try it and collect feedback.", "paragraph", "step-two"),
		],
		{
			Status: { type: "text", value: "In progress" },
			Ready: { type: "checkbox", value: false },
		},
	);
	await note("Projects", "Design ideas", [
		text("idea", "Make the next useful action easy to find."),
	]);
	await note("", "Weekend thoughts", [
		text("thought", "Leave time for a walk and a fresh page."),
	]);
	await note("", "Empty note", []);
	const truncated = await note("", "Recovered fragment", [
		text("kept", "This complete paragraph is still readable."),
	]);
	await host.writeTextAtomic(
		truncated,
		`${await host.readText(truncated)}{"id": "unfinished"\n`,
	);

	for (const title of ["Old outline", "Discarded draft"]) {
		const path = await note("Projects", title, [
			text("draft", "An earlier idea, kept in the trash."),
		]);
		await trashNote(host, path, new Date("2026-10-30T14:00:00Z"));
	}
	return host;
}
