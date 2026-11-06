# Note format additions

Additions to the note file format (see ADR-0002). Every one is additive: the
header and the existing block types are unchanged, and a note that does not use
the new block never contains it.

An older build that meets a block type it does not know opens the note
read-only and does not rewrite it (`checkBlocks`), so nothing is lost.

## `divider` (block type)

- **Where it lives:** a block line, top level or inside a container.
- **Attributes:** none at first. No content, no children.
- **Example line:** `{"id":"d1","type":"divider","parent":null}`
- **Older build:** opens the note read-only.

### `divider` `style` (attribute, added later)

- **Attribute:** `style`, one of `solid`, `dashed`, `dotted`, `thick`. Left out
  when it is `solid`, so a plain divider is still one attribute-free line. A
  value outside that list is shown as `solid` and rewritten on the next edit.
- **Example line:** `{"id":"d2","type":"divider","parent":null,"attrs":{"style":"dashed"}}`
- **Older build:** an older build that does not know the `style` attribute
  opens the note read-only (`checkBlocks`), so nothing is lost.

Fixture: `test-fixtures/divider-styles.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).

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

## `switch` (block type)

- **Where it lives:** a container block, top level or inside another container.
  Its children are one or more blocks of any kind whose `parent` is the
  switch's `id`.
- **Attributes:** `off`, a boolean. Left out when `false` (on), so an on switch
  has no `attrs` at all; written as `{"off":true}` while off. The switch only
  changes how the block looks (dimmed, thin border, faint scan lines); it
  changes no other property. It is shown on canvas cards too.
- **Example lines:**
  ```
  {"id":"s2","type":"switch","parent":null,"attrs":{"off":true}}
  {"id":"s2p","type":"paragraph","parent":"s2","content":[{"text":"Done for now","type":"text"}]}
  ```
- **Older build:** opens the note read-only.

Fixture: `test-fixtures/switch.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).

## `kbd` (inline mark)

- **Where it lives:** in a block's `content`, on a text item, like `bold`:
  `{"marks":[{"type":"kbd"}],"text":"Ctrl+K","type":"text"}`.
- **Attributes:** none.
- **Older build:** opens the note read-only.

## `date` (inline item)

- **Where it lives:** in a block's `content`, between text items. It is inline,
  so it has no id of its own.
- **Attributes:** `date`, `YYYY-MM-DD`. A value that is not a date is shown as
  an empty chip and kept.
- **Example item:** `{"attrs":{"date":"2026-11-05"},"type":"date"}`
- **Older build:** opens the note read-only.

## `codeBlock` `language` (attribute, already stored)

- The attribute existed before; the language picker sets it. It is the language
  name in lower case (`rust`, `python`, `javascript`, ...) and is left out for
  plain text. There is no syntax colouring yet.

Fixture for all three: `test-fixtures/inline-and-code.vnote` (round-trips byte
for byte in `src/editor/doc-blocks.test.ts`).

## Canvas-only blocks: `sticky`, `shape`, `label`, `group`, `connector`

Block types that exist only in a file whose header says `"kind":"canvas"`. They
are root lines (`parent` null) like any card. A note file that contains one is
refused at save time (`canvas-only-in-note`), and a move into a note is refused
before anything is written, so they can never end up in a note.

- **Position and size:** `x`, `y` on every one except `connector`; `w`, `h` on
  `sticky`, `shape` and `group`. Left out when not set.
- **`sticky`:** `tone` (`note`, `info`, `tip`, `warning`, `danger`; left out when
  `note`). Text is the block's `content`, plain text in one text item.
- **`shape`:** `shape` (`rectangle`, `rounded`, `ellipse`, `diamond`; left out
  when `rectangle`), `tone` as for a sticky, optional text in `content`.
- **`label`:** `size` (`s`, `m`, `l`; left out when `m`), text in `content`, no
  frame.
- **`group`:** a frame (`x`, `y`, `w`, `h`), an optional `title`, and `members`,
  a list of the ids of the cards it holds. Membership lives on the group, so
  deleting a group removes only the group line and its members stay put. A card
  is in one group at a time. Groups and connectors are never members.
- **`connector`:** `from` and `to`, the ids of two other root blocks on the same
  canvas, and `arrow` (`none`, `end` or `both`; the app writes `end`). No
  coordinates. When a card that a connector touches is deleted, or moved to a
  note, the connector is removed with it; a card put back on a canvas keeps
  its connectors because it never left.
- **Older build:** builds before this one draw a block type they do not know as
  a plain card and can still move it, which would rewrite its position; they
  cannot read what a shape or group means. From this build on, a canvas that has
  a block type this build does not know opens read-only, so a newer file is
  never changed by an older app. Avoid opening canvases with these blocks in
  an older build.

Fixture: `test-fixtures/canvas-blocks.vnote` (round-trips byte for byte in
`src/core/notes/canvas-ops.test.ts`).
