import { spawn } from "node:child_process";
import process from "node:process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

async function main() {
	const { values, positionals } = parseArgs({
		options: { vault: { type: "string" } },
		allowPositionals: true,
	});
	const [name, json = "{}"] = positionals;
	if (!values.vault || !name || positionals.length > 2) {
		throw new Error(
			"Usage: node scripts/mcp-try.mjs --vault <folder> <tool> '<JSON object>'",
		);
	}
	const args = JSON.parse(json);
	if (!args || typeof args !== "object" || Array.isArray(args)) {
		throw new Error("Pass a JSON object for the tool arguments, such as '{}'.");
	}
	const serverPath = fileURLToPath(
		new URL("../dist-mcp/server.mjs", import.meta.url),
	);
	const child = spawn(process.execPath, [serverPath, "--vault", values.vault], {
		stdio: ["pipe", "pipe", "inherit"],
	});
	const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
	const replies = lines[Symbol.asyncIterator]();
	let failure;
	const fail = (error) => {
		failure = error;
		lines.close();
	};
	child.on("error", fail);
	child.stdin.on("error", fail);
	const timeout = setTimeout(
		() => fail(new Error("The server did not finish within 30 seconds.")),
		30_000,
	);
	let id = 0;
	const send = (message) =>
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
	async function call(method, params) {
		const requestId = ++id;
		send({ id: requestId, method, params });
		for (;;) {
			const line = await replies.next();
			if (line.done || failure)
				throw (
					failure ??
					new Error(
						"The server closed the connection. Run npm run build:mcp and check the vault path.",
					)
				);
			const message = JSON.parse(line.value);
			if (message.id !== requestId) continue;
			if (message.error) throw new Error(message.error.message);
			return message.result;
		}
	}
	try {
		const initialized = await call("initialize", {
			protocolVersion: "2025-11-25",
			capabilities: {},
			clientInfo: { name: "vaultops-hand-test", version: "1.0.0" },
		});
		send({ method: "notifications/initialized" });
		const { tools } = await call("tools/list");
		const { resources } = await call("resources/list");
		const { prompts } = await call("prompts/list");
		console.log(
			JSON.stringify({ initialized, tools, resources, prompts }, null, 2),
		);
		if (!tools.some((tool) => tool.name === name))
			throw new Error(
				`Choose a tool from the list above. No tool named ${name}.`,
			);
		const result = await call("tools/call", { name, arguments: args });
		const text = result.content[0].text;
		console.log(
			result.isError ? text : JSON.stringify(JSON.parse(text), null, 2),
		);
		if (result.isError) process.exitCode = 1;
	} finally {
		clearTimeout(timeout);
		lines.close();
		child.kill();
	}
}

try {
	await main();
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
