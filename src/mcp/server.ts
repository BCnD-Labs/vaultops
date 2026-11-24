import process from "node:process";
import { parseArgs } from "node:util";
import {
	McpServer,
	type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { checkVaultPath } from "../core/vault-path/vault-path";
import { openNodeHost } from "../host/node-host";
import { formatGuide, formatUri, guideTitle, helpText } from "./guide";
import {
	blockRows,
	chunks,
	page,
	pageSize,
	propertyRows,
	titlePreview,
} from "./responses";
import { createReadTools } from "./tools";

const offset = z
	.int({
		error: "Copy the integer offset from hint or omit offset to start at 0.",
	})
	.nonnegative({
		error:
			"Copy the nonnegative offset from hint or omit offset to start at 0.",
	})
	.default(0)
	.meta({
		description: `Zero-based item offset. Default 0. Each page has up to ${pageSize} items. Copy the offset from hint only when truncated is true.`,
		examples: [8],
	});
const section = z
	.enum(["blocks", "properties"], {
		error: 'Use section "blocks" for text or "properties" for fields.',
	})
	.default("blocks")
	.meta({
		description:
			'Select "blocks" for text (default) or "properties" for typed fields.',
		examples: ["properties"],
	});
const notePathHint =
	"Call search_notes with a word from the title and copy its path.";
const cardPathHint = "Call list_resources and copy a card's path.";

function textInput(description: string, example: string, hint: string) {
	return z
		.string({ error: hint })
		.min(1, hint)
		.meta({ description, examples: [example] });
}

function pathInput(example: string, source: string, hint: string) {
	return z
		.string({ error: hint })
		.refine((path) => checkVaultPath(path).ok && /\.vnote$/i.test(path), {
			error: hint,
		})
		.meta({
			description: `Exact vault-relative .vnote path with forward slashes. ${source}`,
			examples: [example],
		});
}

const notePath = pathInput(
	"Notes/Trip.vnote",
	"Copy path from a search_notes or list_notes result. For a journal note, copy path from read_journal_day.",
	notePathHint,
);
const cardPath = pathInput(
	".vaultops/resources/cards/Sam.vnote",
	"Copy path from a card in list_resources.",
	cardPathHint,
);
const noteLinkId =
	"Copy id from get_links for kind note or canvas. Omit id to browse all IDs.";
const cardLinkId =
	"Copy id from get_links for kind resource. Omit id to browse all IDs.";
const targetId =
	"Copy the target's id from search_notes, read_note or read_resource, or from list_notes or a card in list_resources.";
const dayHint = "Call list_journal_days and copy its day (YYYY-MM-DD).";

async function start() {
	const {
		values: { vault },
	} = parseArgs({
		args: process.argv.slice(2),
		options: { vault: { type: "string" } },
	});
	if (!vault) throw new Error("Pass --vault followed by the vault folder.");
	const tools = createReadTools(await openNodeHost(vault));
	const server = new McpServer({ name: "vaultops", version: "0.0.0" });

	function register<Args>(
		name: Exclude<keyof typeof tools, "vault_health"> | "check_vault_health",
		description: string,
		inputSchema: StandardSchemaWithJSON<unknown, Args>,
		run: (args: Args) => Promise<object>,
	) {
		server.registerTool(
			name,
			{
				description,
				inputSchema,
				annotations: { readOnlyHint: true, openWorldHint: false },
			},
			async (args) => {
				try {
					return {
						content: [
							{ type: "text" as const, text: JSON.stringify(await run(args)) },
						],
					};
				} catch {
					return {
						isError: true,
						content: [
							{
								type: "text" as const,
								text: `VaultOps could not complete ${name}. Check that the selected vault is accessible, then try this call once more.`,
							},
						],
					};
				}
			},
		);
	}

	// Listed first: many apps show a small model only the tools, so the help
	// lives in a tool as well as in the format resource and prompt.
	server.registerTool(
		"vaultops_help",
		{
			description:
				"Returns every VaultOps tool in the order to use them, what this server cannot do yet, and step-by-step recipes. Use it first when you are unsure which tool to call. Do not call it twice in a row. For example, call vaultops_help({}).",
			inputSchema: z.strictObject({}),
			annotations: { readOnlyHint: true, openWorldHint: false },
		},
		async () => ({
			content: [{ type: "text" as const, text: JSON.stringify(helpText) }],
		}),
	);

	register(
		"list_notes",
		'Returns paths, titles and IDs of saved notes and canvases. Use it to browse or match a link ID or tag. For text search, use search_notes. For example, call list_notes({"tag":"travel"}).',
		z.strictObject({
			id: textInput(
				`Exact stable ID string. ${noteLinkId}`,
				"note-trip",
				noteLinkId,
			).optional(),
			tag: textInput(
				"Tag as returned in list_tags.items[].tag, for example travel. Includes subtags. Omit for all tags.",
				"travel",
				"Copy tag from list_tags or omit tag.",
			).optional(),
			offset,
		}),
		async (args) => {
			const notes = await tools.list_notes(args);
			const rows = notes
				.filter((note) => !args.id || note.noteId === args.id)
				.map(({ path, title, noteId, kind }) => ({
					path,
					title: titlePreview(title),
					id: noteId,
					kind,
				}));
			return page(
				"list_notes",
				args,
				rows,
				args.id
					? "No notes or canvases have this ID. Check the link kind. For a resource link call list_resources with its id."
					: args.tag
						? "No notes match this tag. Call list_tags to check the tag or call list_notes without a tag."
						: "The vault has no readable notes or canvases. Call check_vault_health to look for unreadable files.",
			);
		},
	);
	register(
		"search_notes",
		'Returns note and canvas paths, titles, IDs and matching text snippets. Use it to find words in titles, headings, tags, properties or text. To browse everything, use list_notes. For example, call search_notes({"query":"trip"}).',
		z.strictObject({
			query: textInput(
				'A few words such as trip or one quoted phrase such as "trip plan". All words must match.',
				"trip",
				"Pass one or two words from the note title or text as query.",
			),
			offset,
		}),
		async (args) =>
			page(
				"search_notes",
				args,
				(await tools.search_notes(args)).map(
					({ path, title, noteId, snippet }) => ({
						path,
						title: titlePreview(title),
						id: noteId,
						snippet,
					}),
				),
				"No matches. Try one distinctive word from the title, or call list_notes to browse.",
			),
	);
	register(
		"read_note",
		'Returns a saved note or canvas as block text or typed properties. Use it with a path from search_notes or list_notes. For resource cards, use read_resource. For journal entries grouped by section, use read_journal_day. For example, call read_note({"path":"Notes/Trip.vnote"}).',
		z.strictObject({ path: notePath, section, offset }),
		async (args) => {
			const found = await tools.read_note(args);
			const note = found?.note;
			const rows = !note
				? []
				: args.section === "blocks"
					? blockRows(note.blocks)
					: propertyRows(note.properties);
			return {
				path: args.path,
				title: note ? titlePreview(note.title) : null,
				id: note?.noteId ?? null,
				status: found?.health.group ?? "missing",
				...page(
					"read_note",
					args,
					rows,
					!found
						? `No note at ${args.path}. ${notePathHint}`
						: !note
							? "The note cannot be read. Call check_vault_health to see the file problem."
							: `This note has no ${args.section}. Report that and stop paging.`,
				),
			};
		},
	);
	register(
		"list_tags",
		"Returns tags used by saved notes and canvases. Use it to learn the exact tag to pass to list_notes. To find a word inside notes, use search_notes. For example, call list_tags({}).",
		z.strictObject({ offset }),
		async (args) =>
			page(
				"list_tags",
				args,
				(await tools.list_tags()).map((tag) => ({ tag })),
				"The vault has no saved tags. Call list_notes to browse all notes.",
			),
	);
	register(
		"get_links",
		'Returns the IDs, kinds and saved labels of links from one note or canvas. Use it to follow a link out of the source note. Copy id into list_notes for a note or canvas, or list_resources for a resource. For links pointing in, use get_backlinks. For example, call get_links({"path":"Notes/Trip.vnote"}).',
		z.strictObject({ path: notePath, offset }),
		async (args) => {
			const links = await tools.get_links(args);
			return page(
				"get_links",
				args,
				(links ?? []).map(({ target, label, kind }) => ({
					id: target,
					title: titlePreview(label),
					kind,
				})),
				!links
					? `No readable note at ${args.path}. ${notePathHint}`
					: "This note has no outgoing vault links. Use get_backlinks if you need links pointing to the note.",
			);
		},
	);
	register(
		"get_backlinks",
		'Returns paths, titles and IDs of notes and canvases linking to one target ID. Use it to find incoming links to a note, canvas or resource. For outgoing links from a note or canvas, use get_links. For example, call get_backlinks({"id":"note-trip"}).',
		z.strictObject({
			id: textInput(
				`Exact stable ID string. ${targetId}`,
				"note-trip",
				targetId,
			),
			offset,
		}),
		async (args) =>
			page(
				"get_backlinks",
				args,
				(await tools.get_backlinks({ noteId: args.id })).map(
					({ path, title, noteId, kind }) => ({
						path,
						title: titlePreview(title),
						id: noteId,
						kind,
					}),
				),
				"No backlinks for this ID. Verify the id in list_notes or list_resources, then report that no links point to it.",
			),
	);
	register(
		"list_journal_days",
		"Returns saved journal dates and paths, newest first. Use it to pick a date to pass to read_journal_day. For notes outside the journal, use list_notes. For example, call list_journal_days({}).",
		z.strictObject({ offset }),
		async (args) =>
			page(
				"list_journal_days",
				args,
				await tools.list_journal_days(),
				"The vault has no saved journal days. Call list_notes if the user is looking for a regular note.",
			),
	);
	register(
		"read_journal_day",
		'Returns text entries from one saved journal day with their section names. Use it after list_journal_days. For regular notes, use read_note. For the day’s outgoing links, copy the returned path into get_links. For example, call read_journal_day({"day":"2026-11-24"}).',
		z.strictObject({
			day: z.iso.date({ error: dayHint }).meta({
				description: `Calendar date. ${dayHint}`,
				examples: ["2026-11-24"],
			}),
			offset,
		}),
		async (args) => {
			const found = await tools.read_journal_day(args);
			const rows = (found?.sections ?? []).flatMap(({ name, entries }) =>
				entries.flatMap(({ id, text }) =>
					chunks(text).map((part, index) => ({
						id,
						type: "paragraph",
						section: titlePreview(name),
						text: part,
						chunk: index + 1,
					})),
				),
			);
			return {
				day: args.day,
				path: found?.health.path ?? null,
				status: found?.health.group ?? "missing",
				...page(
					"read_journal_day",
					args,
					rows,
					!found
						? `No saved journal for ${args.day}. ${dayHint}`
						: !found.sections
							? "The journal could not be read. Call check_vault_health to see the file problem."
							: "This journal day has no text entries. Use get_links with its path to check for linked material.",
				),
			};
		},
	);
	register(
		"list_resources",
		'Returns resource card paths, titles and IDs, or the names and IDs of card types. Use it to browse cards or find the card for a resource link ID. To open a card, use read_resource. To find regular notes, use list_notes. For example, call list_resources({"id":"resource-sam"}).',
		z.strictObject({
			id: textInput(
				`Exact stable ID string. ${cardLinkId}`,
				"resource-sam",
				cardLinkId,
			).optional(),
			section: z
				.enum(["cards", "types"], { error: 'Use section "cards" or "types".' })
				.default("cards")
				.meta({
					description:
						'Select "cards" (default) to browse cards or match a link id. Select "types" to list card types.',
					examples: ["types"],
				}),
			offset,
		}),
		async (args) => {
			const { cards, types } = await tools.list_resources();
			const rows =
				args.section === "types"
					? types.map(({ id, name }) => ({ id, title: titlePreview(name) }))
					: cards
							.filter(({ noteId }) => !args.id || noteId === args.id)
							.map(({ path, title, noteId, typeId }) => ({
								path,
								title: titlePreview(title),
								id: noteId || null,
								typeId,
							}));
			return page(
				"list_resources",
				args,
				rows,
				args.id
					? "No card matches this ID. Verify the id and kind in get_links, then report that the target is missing if the ID matches."
					: args.section === "types"
						? "No resource types. Call list_resources with section cards to check for cards."
						: "The vault has no resource cards. Call list_notes if the user is looking for a regular note.",
			);
		},
	);
	register(
		"read_resource",
		'Returns the typed fields or block text of one resource card. Use it with a card path from list_resources. For a regular note or canvas, use read_note. For example, call read_resource({"path":".vaultops/resources/cards/Sam.vnote"}).',
		z.strictObject({
			path: cardPath,
			section: section.default("properties").meta({
				description:
					'Select "properties" for fields (default) or "blocks" for text.',
				examples: ["blocks"],
			}),
			offset,
		}),
		async (args) => {
			const card = await tools.read_resource(args);
			const rows = !card
				? []
				: args.section === "blocks"
					? blockRows(card.blocks)
					: propertyRows(card.props);
			return {
				path: args.path,
				title: card ? titlePreview(card.title) : null,
				id: card?.noteId || null,
				typeId: card?.typeId ?? null,
				status: !card ? "missing" : card.problem ? "unreadable" : "good",
				...page(
					"read_resource",
					args,
					rows,
					!card
						? `No resource card at ${args.path}. ${cardPathHint}`
						: card.problem
							? "This resource card is unreadable. Check the card in the VaultOps app before retrying."
							: `This card has no ${args.section}. Report that and stop paging.`,
				),
			};
		},
	);
	register(
		"check_vault_health",
		"Returns paths and reasons for unreadable notes, incomplete files, newer formats or duplicate IDs. Use it to investigate file problems. To browse readable notes, use list_notes. For example, call check_vault_health({}).",
		z.strictObject({ offset }),
		async (args) => {
			const report = await tools.vault_health();
			return page(
				"check_vault_health",
				args,
				report
					.filter(
						({ group, duplicateOf, duplicateBlockOf }) =>
							group !== "good" ||
							duplicateOf.length > 0 ||
							Boolean(duplicateBlockOf?.length),
					)
					.map(({ path, group, reason }) => ({
						path,
						status: group === "good" ? "duplicate-id" : group,
						reason,
					})),
				"No note file problems were found. Call list_notes to browse the vault.",
			);
		},
	);

	server.registerResource(
		"note-format",
		formatUri,
		{ title: "VaultOps note format", mimeType: "text/plain" },
		() => ({
			contents: [{ uri: formatUri, mimeType: "text/plain", text: formatGuide }],
		}),
	);
	server.registerPrompt(
		"understand_vaultops_note",
		{
			title: guideTitle,
			description:
				"Explain a VaultOps note and follow the recipes to read saved notes, links and journal entries.",
		},
		() => ({
			messages: [
				{ role: "user", content: { type: "text", text: formatGuide } },
			],
		}),
	);
	await server.connect(new StdioServerTransport());
}

try {
	await start();
} catch (error) {
	console.error(
		error instanceof Error ? error.message : "Could not start VaultOps MCP.",
	);
	process.exitCode = 1;
}
