# VaultOps MCP

The server reads saved notes in one vault over standard input and output (stdio). It runs without the Mac app. Start with a spare vault and a local model that supports tool calling.

## Build and start

Build from the repo using Node 22.12 or later. The built server runs with Node 22 or later.

```sh
npm ci
npm run build:mcp
npm run --silent mcp -- --vault "/path/to/Test Vault"
```

The server waits for a client to send requests. Stop it with Ctrl+C. Clients launch the single file `dist-mcp/server.mjs` directly. Rebuild it after updating VaultOps, then restart the client.

The hand-test client starts its own server, lists the tools, resources and prompts, and calls one tool with your JSON arguments. This example reads a note shipped with the repo.

```sh
node scripts/mcp-try.mjs --vault test-fixtures read_note '{"path":"note-links.vnote"}'
```

## LM Studio

Load a local model with tool calling. In the right sidebar, open **Program → Install → Edit mcp.json**. Add VaultOps under `mcpServers` and replace the example paths. Use the full Node path from `command -v node`. Save the file, enable VaultOps in the chat, and ask it to list the notes. [LM Studio MCP setup](https://lmstudio.ai/docs/app/mcp)

```json
{
  "mcpServers": {
    "vaultops": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/path/to/vaultops/dist-mcp/server.mjs", "--vault", "/path/to/Test Vault"]
    }
  }
}
```

## Ollama with goose

1. Start Ollama and install a tool-calling model, for example with `ollama pull qwen3`. [Ollama tool calling](https://docs.ollama.com/capabilities/tool-calling)
2. In `goose configure`, choose **Configure Providers → Ollama**, enter `http://127.0.0.1:11434` and select the installed model. [goose provider setup](https://goose-docs.ai/docs/getting-started/providers/)
3. In `goose configure`, choose **Add Extension → Command-Line Extension**. Name it VaultOps and enter the same executable and arguments as in the LM Studio example. Quote paths with spaces when entering the command. Run `goose session` and ask it to find a note, then read the returned path. [goose extension setup](https://goose-docs.ai/docs/getting-started/using-extensions/)

## Tool rules for small local models

- Give each tool one verb_noun name and one job. Start the description with what it returns. Say when to use it and name the tool for a nearby job. Include one small example call.
- Give every input a description, format and example. Keep required fields to a minimum, use enums for fixed choices and state defaults. For IDs and paths, name the exact tool and output field to copy. When multiple results fit, ask the user to choose a path.
- Return short, flat rows in `items`, using `path`, `title` and `id` for the same meanings across tools. Use previews for display titles. Show block text with `id` and `type`. Long text uses numbered `chunk` rows. Return at most eight rows. When more are available, return `truncated: true` and put the exact next call in `hint`. Stop paging at `truncated: false`.
- Give errors and empty results a concrete next step. Ask the user for more detail when one suggested retry fails.
- Keep `vaultops://format` and the **Understand a VaultOps note** prompt up to date with the three-step recipes for finding and reading a note, following links and reading a journal day.
