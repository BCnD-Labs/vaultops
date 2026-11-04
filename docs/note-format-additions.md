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

## `toggle` (block type)

- **Where it lives:** a container block, top level or inside another toggle,
  list item or quote. Its first child is a `paragraph` block, the summary line
  that stays visible. Every child after it is the body and can be any block,
  including another toggle. Children's `parent` is the toggle's `id`.
- **Attributes:** `open`, a boolean. Left out when `false` (closed), so a
  closed toggle has no `attrs` at all; written as `{"open":true}` while open.
  Opening or closing a toggle in the app is saved like any other edit.
- **Example lines:**
  ```
  {"id":"t2","type":"toggle","parent":null,"attrs":{"open":true}}
  {"id":"t2s","type":"paragraph","parent":"t2","content":[{"text":"Summary","type":"text"}]}
  {"id":"t2b","type":"paragraph","parent":"t2","content":[{"text":"Body","type":"text"}]}
  ```
- **Moving:** drag and "move to note" carry the whole toggle with every
  descendant line (the same rule as every other container).
- **Older build:** opens the note read-only.

Fixture: `test-fixtures/toggle.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).
