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

Append `?theme=<id>&mode=light|dark|system` to choose a preview, for example
`/harness.html?theme=graphite&mode=dark` or
`/harness.html?theme=high-contrast&mode=light`. Theme IDs are `default`, `graphite`
and `high-contrast`. System mode follows the OS appearance live. Omitted parameters
use the stored choice; invalid choices fall back to default/system. URL overrides
are temporary and do not change the stored theme.
