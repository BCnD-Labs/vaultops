# Note format additions

Additions to the note file format (see ADR-0002). Every one is additive: the
header and the existing block types are unchanged, and a note that does not use
the new block never contains it.

An older build that meets a block type it does not know opens the note
read-only and does not rewrite it (`checkBlocks`), so nothing is lost.

## `divider` (block type)

- **Where it lives:** a block line, top level or inside a container.
- **Attributes:** none. No content, no children.
- **Example line:** `{"id":"d1","type":"divider","parent":null}`
- **Older build:** opens the note read-only.

## `callout` (block type)

- **Where it lives:** a container block. Its children are `paragraph` blocks
  (one or more) whose `parent` is the callout's `id`.
- **Attributes:** `tone`, one of `note`, `info`, `tip`, `warning`, `danger`.
  Left out when it is `note`, so a plain callout has no `attrs` at all. A value
  outside that list is shown as `note` and rewritten on the next edit.
- **Example lines:**
  ```
  {"id":"c2","type":"callout","parent":null,"attrs":{"tone":"warning"}}
  {"id":"c2p1","type":"paragraph","parent":"c2","content":[{"text":"Careful","type":"text"}]}
  ```
- **Older build:** opens the note read-only.

Fixture: `test-fixtures/callout-divider.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).
