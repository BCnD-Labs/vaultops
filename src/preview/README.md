# Browser preview (dev only)

From the repo root, run:

```sh
npx vite --config vite.preview.config.ts
```

Vite opens `/harness.html`; if needed, open that path on the local URL printed
in the terminal. This mounts the real App with a seeded MemoryHost. No Tauri
runtime or local vault is needed. Changes stay in memory; reload to start fresh.
The sample includes nested folders, ten notes, tags and properties, an empty
note, a deliberately truncated note (see Vault health), and two trashed notes.

This is a development tool. The normal `npm run build` / `tauri build` still
uses only `index.html`; no preview entry or sample vault ships in `dist`.

## Preview a theme

Add `?theme=<id>&mode=light|dark|system` to `/harness.html`. Built-in IDs are
`default` (Mac flat), `graphite`, and `high-contrast`. For example:

- `/harness.html?theme=graphite&mode=light`
- `/harness.html?theme=high-contrast&mode=dark`
- `/harness.html?theme=default&mode=system`

System mode follows the OS appearance live. Missing or invalid parameters use
that part of the saved theme choice (default/system if none). URL choices do
not change the saved preference; reload with another URL to switch.
