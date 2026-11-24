import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
let temp: string;
let vault: string;
let serverPath: string;

beforeAll(async () => {
	temp = await mkdtemp(join(tmpdir(), "vaultops-mcp-"));
	vault = join(temp, "Test Vault");
	const cards = join(vault, ".vaultops/resources/cards");
	const journal = join(vault, "Journal");
	await Promise.all([
		mkdir(cards, { recursive: true }),
		mkdir(journal, { recursive: true }),
	]);
	for (const [fixture, path] of [
		["note-links.vnote", join(vault, "note-links.vnote")],
		["columns.vnote", join(vault, "columns.vnote")],
		["toggle.vnote", join(journal, "2026-11-24.vnote")],
		["resource-card.vnote", join(cards, "Mara.vnote")],
	] as const) {
		await copyFile(join(root, "test-fixtures", fixture), path);
	}
	const outDir = join(temp, "build");
	await build({
		root,
		configFile: join(root, "vite.mcp.config.ts"),
		logLevel: "error",
		build: { outDir },
	});
	serverPath = join(outDir, "server.mjs");
});

afterAll(async () => {
	if (temp) await rm(temp, { recursive: true, force: true });
});

async function connect() {
	const child = spawn(process.execPath, [serverPath, "--vault", vault], {
		stdio: ["pipe", "pipe", "inherit"],
	});
	const exited = once(child, "close");
	const lines = createInterface({ input: child.stdout });
	const replies = lines[Symbol.asyncIterator]();
	const send = (msg: object) =>
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
	let id = 0;
	async function call(method: string, params?: object) {
		const requestId = ++id;
		send({ id: requestId, method, params });
		const { value } = await replies.next();
		if (value === undefined)
			throw new Error(`Server closed before replying to ${method}`);
		const reply = JSON.parse(value);
		expect(reply).toMatchObject({
			jsonrpc: "2.0",
			id: requestId,
			result: expect.any(Object),
		});
		return reply.result;
	}
	async function tool(name: string, args: object) {
		const result = await call("tools/call", { name, arguments: args });
		expect(result.isError).toBeUndefined();
		return JSON.parse(result.content[0].text);
	}
	return {
		call,
		tool,
		send,
		async close() {
			child.kill();
			lines.close();
			await exited;
		},
	};
}

test("serves tools, the format guide and the prompt over stdio", async () => {
	const { call, tool, send, close } = await connect();
	try {
		const hello = await call("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "vitest", version: "1" },
		});
		expect(hello).toMatchObject({
			protocolVersion: "2024-11-05",
			serverInfo: { name: "vaultops" },
			capabilities: {
				tools: expect.any(Object),
				resources: expect.any(Object),
				prompts: expect.any(Object),
			},
		});
		send({ method: "notifications/initialized" });
		const { tools } = await call("tools/list");
		expect(tools.map(({ name }: { name: string }) => name)).toEqual([
			"vaultops_help",
			"list_notes",
			"search_notes",
			"read_note",
			"list_tags",
			"get_links",
			"get_backlinks",
			"list_journal_days",
			"read_journal_day",
			"list_resources",
			"read_resource",
			"check_vault_health",
		]);
		for (const { name, description, annotations, inputSchema } of tools) {
			expect(description).toMatch(/^Returns .+\. Use it .+/);
			const example = description.split(`For example, call ${name}(`)[1];
			expect(JSON.parse(example.slice(0, -2))).toBeTypeOf("object");
			expect(annotations.readOnlyHint).toBe(true);
			expect(inputSchema.type).toBe("object");
			for (const property of Object.values(inputSchema.properties)) {
				expect(property).toMatchObject({
					description: expect.stringMatching(/\S/),
					examples: [expect.anything()],
				});
			}
		}

		const help = await tool("vaultops_help", {});
		expect(help.tools_in_order).toHaveLength(tools.length - 1);
		for (const line of help.tools_in_order)
			expect(tools.map((t: { name: string }) => t.name)).toContain(
				line.split(":")[0],
			);
		expect(help.cannot_do_yet.join(" ")).toMatch(/move.*version control/s);

		const listed = await tool("list_notes", {});
		expect(listed.next_step).toBe(
			`To read a note, call read_note({"path":${JSON.stringify(listed.items[0].path)}}) with its path.`,
		);
		const nowhere = await tool("list_notes", { folder: "No such folder" });
		expect(nowhere.items).toEqual([]);
		expect(nowhere.hint).toContain("look at the start of each path");
		const wrong = await call("tools/call", {
			name: "list_notes",
			arguments: { query: "x" },
		});
		expect(JSON.stringify(wrong)).toContain(
			'list_notes does not take \\"query\\". It takes: id, tag, folder, offset. To find words inside notes, use search_notes.',
		);

		const path = "columns.vnote";
		const first = await tool("read_note", { path });
		expect(first).toMatchObject({
			path,
			id: "columns-1",
			status: "good",
			truncated: true,
			hint: 'Call read_note with {"path":"columns.vnote","section":"blocks","offset":8} to see more.',
		});
		expect(first.items).toHaveLength(8);
		expect(first.items[0]).toEqual({
			id: "k0",
			type: "paragraph",
			parent: null,
			text: "Above the columns",
			chunk: 1,
		});
		const last = await tool("read_note", { path, offset: 16 });
		expect(last).toMatchObject({ truncated: false, hint: null });
		expect(last.items).toHaveLength(3);
		expect(await tool("read_note", { path: "missing.vnote" })).toMatchObject({
			status: "missing",
			items: [],
			truncated: false,
			hint: expect.stringContaining("Call search_notes"),
		});
		const bad = await call("tools/call", {
			name: "read_note",
			arguments: { path: "../outside.vnote" },
		});
		expect(bad).toMatchObject({
			isError: true,
			content: [{ text: expect.stringContaining("Call search_notes") }],
		});

		expect(await tool("get_links", { path: "note-links.vnote" })).toMatchObject(
			{
				items: [
					{ id: "resource-sam", kind: "resource" },
					{ id: "note-trip", kind: "note" },
					{ id: "canvas-ideas", kind: "canvas" },
				],
			},
		);
		expect(
			await tool("list_resources", { id: "resource-card-1" }),
		).toMatchObject({
			items: [{ path: ".vaultops/resources/cards/Mara.vnote" }],
		});
		expect(
			await tool("read_resource", {
				path: ".vaultops/resources/cards/Mara.vnote",
			}),
		).toMatchObject({
			items: expect.arrayContaining([
				{
					name: "Birthday",
					type: "date",
					value: "1984-03-12",
					item: null,
					chunk: 1,
				},
			]),
		});
		expect(await tool("read_journal_day", { day: "2026-11-24" })).toMatchObject(
			{
				path: "Journal/2026-11-24.vnote",
				items: expect.arrayContaining([
					expect.objectContaining({ text: "Before the toggles" }),
				]),
			},
		);

		const uri = "vaultops://format";
		expect(await call("resources/list")).toMatchObject({
			resources: [{ uri }],
		});
		const { contents } = await call("resources/read", { uri });
		const guide = contents[0].text;
		for (const text of [
			"JSON header",
			"stable noteId",
			"parent",
			"tags property",
			"Find a note",
			"Follow links",
			"Read a journal day",
		])
			expect(guide).toContain(text);
		const name = "understand_vaultops_note";
		expect(await call("prompts/list")).toMatchObject({
			prompts: [{ name, title: "Understand a VaultOps note" }],
		});
		expect(await call("prompts/get", { name })).toMatchObject({
			messages: [{ role: "user", content: { type: "text", text: guide } }],
		});
	} finally {
		await close();
	}
});
