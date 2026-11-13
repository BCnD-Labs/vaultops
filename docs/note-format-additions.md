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

## `blockquote` `color` (attribute, added later)

- **Where it lives:** on a `blockquote` container line, top level or inside
  another container. Its children are the quoted blocks (`paragraph`, etc.)
  whose `parent` is the quote's `id`.
- **Attribute:** `color`, one of `red`, `orange`, `yellow`, `green`, `teal`,
  `blue`, `purple`, `pink`, `gray`. Left out when at its default (none), so a
  plain quote still has no `attrs` at all. A value outside that list is shown
  with the default bar colour and rewritten on the next edit.
- **Example lines:**
  ```
  {"id":"q2","type":"blockquote","parent":null,"attrs":{"color":"blue"}}
  {"id":"q2p","type":"paragraph","parent":"q2","content":[{"text":"Blue bar","type":"text"}]}
  ```
- **Older build:** an older build that does not know the `color` attribute on
  `blockquote` opens the note read-only (`checkBlocks`), so nothing is lost.

Fixture: `test-fixtures/blockquote-colors.vnote` (round-trips byte for byte in
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

### `callout` `icon` and `color` (attributes, added later)

- **Title and body:** a callout's first child `paragraph` is shown as its title
  row (beside the icon, in bold coloured text) and any following `paragraph`
  children are the body.
- **Attributes:**
  - `icon`, a lucide icon name in lower-case kebab form (for example `flame`,
    `rocket`, `book-open`). Left out when at its default (none, which uses the
    `tone`'s icon).
  - `color`, one of `red`, `orange`, `yellow`, `green`, `teal`, `blue`,
    `purple`, `pink`, `gray`, or a `#rrggbb` hex colour. Left out when at its
    default (none, which uses the `tone`'s colour).
- **Example lines:**
  ```
  {"id":"c2","type":"callout","parent":null,"attrs":{"color":"purple","icon":"flame"}}
  {"id":"c2t","type":"paragraph","parent":"c2","content":[{"text":"Custom callout","type":"text"}]}
  {"id":"c2b","type":"paragraph","parent":"c2","content":[{"text":"With flame icon and purple tint","type":"text"}]}
  ```
- **Older build:** an older build that does not know `icon` or `color` on
  `callout` opens the note read-only (`checkBlocks`), so nothing is lost.

Fixture: `test-fixtures/callout-styles.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).

## `toggle` (block type)

- **Where it lives:** a container block, top level or inside another toggle,
  list item or quote. Its first child is a `paragraph` block, or a `heading`
  (level 1 or 2) for a toggle heading, the summary line that stays visible. Every child after it is the body and can be any block,
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
- **Toggle heading:** the same line shapes with a `heading` as the first child
  (`attrs.level` is left out for level 1, as for any heading). Backspace at
  the start of it turns it back into a plain heading with the body after it.
- **Older build:** opens the note read-only.

Fixtures: `test-fixtures/toggle.vnote` and `test-fixtures/toggle-heading.vnote`
(both round-trip byte for byte in `src/editor/doc-blocks.test.ts`).

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

## `codeBlock` `wrap` (attribute, added later)

- **Where it lives:** on a `codeBlock` line, as `attrs.wrap`: `true` when the
  block wraps long lines instead of scrolling sideways.
- **Left out when false.** A block that was never wrapped is written exactly as
  before, so notes nobody touched are unchanged on disk. Anything other than
  `true` is read as not wrapped and dropped on the next save.
- **Display only.** It never changes the code text. Line numbers are a setting
  of the app and are not stored in the note.
- **Example line:** `{"id":"c1","type":"codeBlock","parent":null,"attrs":{"language":"python","wrap":true},"content":[{"text":"print(1)","type":"text"}]}`
- **Older build:** opens the note read-only (it does not know `wrap`), so
  nothing is lost.

Fixture: `test-fixtures/code-block-display.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).

## `databaseRow` `noteId` (attribute, added later)

A database row (`databaseRow`, a child line of a `database`; its own page is
the lines that follow with the row as `parent`) can be turned into a note. The
row stays in the database with all its cells and remembers the note.

- **Where it lives:** on a `databaseRow` line, as `attrs.noteId`: the `noteId`
  (from the header) of the note the row was turned into.
- **Left out when there is none**, so a row that was never turned into a note
  is unchanged on disk. Anything that is not a non-empty string is read as no
  link and rewritten on the next edit.
- **The row has no page of its own** while it has a `noteId`: the page lines
  moved into the note (with new block ids, so no block id is in two files). The
  app never writes page lines under a linked row.
- **Same name both ways:** the row's Name cell (`cells.title`) and the note's
  header `title` are kept the same by the app, whichever is edited. A blank
  Name and the title "Untitled" count as the same. Only the name is shared; no
  other cell or property is.
- **If the note is not in the vault** (deleted or in the trash) the row shows
  "Note not found" and can be unlinked; restoring the note from the trash makes
  the link work again, because the link is the `noteId`, not a file name.
- **Example lines:**
  ```
  {"id":"r1","type":"databaseRow","parent":"db1","attrs":{"cells":{"title":"Dune"},"noteId":"note-dune"}}
  {"id":"r2","type":"databaseRow","parent":"db1","attrs":{"cells":{"title":"Emma"}}}
  ```
- **Older build:** an older build that does not know the `noteId` attribute on
  `databaseRow` opens the note read-only (`checkBlocks`), so nothing is lost.

Fixture: `test-fixtures/database-row-note.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).

## Canvas-only blocks: `sticky`, `shape`, `label`, `group`, `connector`, `embed`

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
- **A card's color (`fill`):** an ordinary block on a canvas (a paragraph,
  list, callout and so on) may carry `attrs.fill`, one of `note`, `info`, `tip`,
  `warning` or `danger` (left out when `note`). It is not `tone`, which on a
  callout means the callout's kind. It belongs to the canvas only: moving the
  card to a note drops it, so a note never has this attribute.
- **`label`:** `size` (`s`, `m`, `l`; left out when `m`), text in `content`, no
  frame. `size` is the text size, and a `sticky` and a `shape` may carry it too
  (same values, left out when `m`).
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

- **`embed`:** shows another note read-only on the canvas. `note` is the
  `noteId` of the note it shows (not its path, so a rename or a move does not
  break it), plus `x`, `y`, `w`, `h`. It has no content and never writes to the
  note it shows. If no file has that id the embed stays in the file and says the
  note is missing, so it shows again if the note comes back; if several files
  share the id, or the id belongs to a canvas, nothing is shown. Deleting the
  embed removes only the embed line. Added in this build: older builds treat it
  as an unknown type and open the canvas read-only.
- **Stacking order:** the order of the root lines in a canvas file is the
  order items are drawn in: a later line sits on top of an earlier one. "Bring
  to front", "Bring forward", "Send backward" and "Send to back" only reorder
  lines (a card keeps its child lines right after it); they add no attribute, so
  the format is unchanged. Groups are always drawn behind everything and
  connectors are lines, so neither is stacked.

Fixtures: `test-fixtures/canvas-blocks.vnote` (round-trips byte for byte in
`src/core/notes/canvas-ops.test.ts`) and `test-fixtures/canvas-embed.vnote`
(`src/core/notes/canvas-embed.test.ts`).

## `columns` and `column` (block types)

- **Where they live:** `columns` is a container block on the note's own level
  only (`parent` is `null`). It is not allowed inside a column, a toggle, a
  callout, a list, a quote or a table cell, so layouts never nest. Its children
  are two or three `column` blocks, in order, whose `parent` is the `columns`
  id. Each `column` holds one or more blocks of any kind except `columns`,
  whose `parent` is the `column` id.
- **Attributes:** none. The columns are always equal width; there is no
  resizing. A layout with fewer than two or more than three columns, a `column`
  outside a `columns`, or a `columns` anywhere but the note's own level is not
  a layout this version can edit.
- **Example lines:**
  ```
  {"id":"k1","type":"columns","parent":null}
  {"id":"k1a","type":"column","parent":"k1"}
  {"id":"k1ap","type":"paragraph","parent":"k1a","content":[{"text":"Left","type":"text"}]}
  {"id":"k1b","type":"column","parent":"k1"}
  {"id":"k1bp","type":"paragraph","parent":"k1b","content":[{"text":"Right","type":"text"}]}
  ```
- **Moving:** the layout and its columns are not dragged (no grip). A block in a
  column drags out like any block, taking its own lines with it; a block nested
  inside another block in a column leaves through "Move out", which places it
  just below the layout. Neither can be placed on a canvas: `placeOnCanvas`
  refuses with "Columns stay in notes."
- **Older build:** opens the note read-only.

Fixture: `test-fixtures/columns.vnote` (round-trips byte for byte in
`src/editor/columns.test.tsx`).

## Templates (storage layout, no new block type)

- **Where they live:** `.vaultops/templates/`, created the first time a template
  is saved (an older vault simply has no such folder). Inside it, folders nest
  freely, and a template is an ordinary note file: `<name>.vnote`, in the same
  format as any note (header with its own `noteId` and `title`, then block lines).
  Nothing about the note format changes.
- **Hidden:** the folder is inside `.vaultops/`, so the note tree, search, tags,
  the health report and the version-control history never list it.
- **Placeholders:** `{{title}}`, `{{date}}` (`YYYY-MM-DD`) and `{{time}}`
  (`HH:mm`) in a block's text are replaced when the template is inserted into a
  note. Nothing else in braces is touched. The template file itself is never
  changed by using it.
- **Using one:** the slash menu's "Template" item inserts the chosen template at
  the caret (in place of an empty line, otherwise after the block holding the
  caret). Every inserted block gets a new id.
- **Never lost:** removing a template or folder, and replacing one with the same
  name, moves it to `.vaultops/recovery/<time>/templates/<its path>` instead of
  erasing it.
- **Older build:** ignores the folder.

Fixture: `test-fixtures/template.vnote` (a normal note with placeholders; read
back through the template list in `src/core/notes/templates.test.ts`).

## Resources (storage layout, no new block type)

- **Where they live:** `.vaultops/resources/`, created the first time a type is
  changed or a card is saved (an older vault simply has no such folder).
  `types.json` holds the resource types; `cards/<name>.vnote` holds one card
  each. Both are inside `.vaultops/`, so the note tree, search, tags and the
  health report never list them.
- **A card is an ordinary note file** in the existing format. Its values are the
  header's free-form `props` (ADR-0002), keyed by the field's label; its type is
  `resource.type` in the header, and `resource.updated` is an ISO time. The body
  blocks are free for extra notes. Nothing about the note format changes.
- **`types.json`** is `{"format":"vaultops-resource-types","v":1,"types":[...]}`
  where a type is `{id, name, titleLabel, fields:[{label, kind, required}]}` and
  `kind` is `text`, `long`, `date`, `link` or `number`. Until the first change is
  saved, Contact, Book and Article are used from the app without a file. A file
  that cannot be read, or is newer than this version, is never overwritten; the
  manager is view-only until it is fixed.
- **Removing is guided and safe:** taking a field off a type leaves every value on
  its cards as an extra property (still searchable). Removing the values too
  copies each affected card to `.vaultops/recovery/<time>/resources/cards/` first.
  Deleting a type copies the old `types.json` to
  `.vaultops/recovery/<time>/resources/types.json`; its cards keep every value,
  and either lose their type or move to another type (values with a matching field
  label move into that field, the rest stay as extras). Removing a card moves the
  file to the recovery folder.
- **Older build:** ignores the folder.

Fixtures: `test-fixtures/resource-card.vnote` and
`test-fixtures/resource-types.json` (read back in
`src/core/resources/resources.test.ts`).

## Recovery folder (storage layout, already in use)

- `.vaultops/recovery/<time>/<original path>` holds anything removed for good,
  so the app never erases a note or template: "Remove from trash" moves the
  note there (keeping its folder layout), and removing or replacing a template
  puts it under `<time>/templates/`. A fresh `<time>` folder is made for every
  removal, so names never clash.
- The app does not list or open this folder; the files are ordinary notes and
  can be copied back by hand (or restored by a future "Recovered" screen).
- The only true erase left is internal bookkeeping (`pending.jsonl`), never a
  note or template.

## Note links (new inline item)

- **What it is:** a link to a note, a canvas or a resource card, inside a line of
  text. Saved as an inline item in a block's `content`, next to `text` and `date`:
  `{"type":"noteLink","attrs":{"kind":"note|canvas|resource","target":"<noteId>","label":"<name when made>"}}`.
- **It points at a `noteId`**, not a path, so renaming or moving the target keeps
  the link working. `label` is only the name the target had when the link was
  made; the editor shows the target's current name and falls back to `label`
  (struck through, with a hint) when the target is gone. Nothing is rewritten when
  a target is renamed or deleted.
- **Typing:** `[[` opens a picker over notes, canvases and resources (grouped);
  `@` opens the same picker with resources only. `{{ }}` is not used, because
  templates already use it for placeholders. The slash menu has matching
  "Link" and "Mention a resource" items.
- **Mentioned in:** a resource card lists the notes and canvases that link to it
  by scanning the vault; no index file is stored, so there is nothing to go stale.
- **Search:** resource cards appear in the Ctrl/Cmd+K bar once something is typed,
  found by title or by anything on the card.
- **Gone targets:** a link whose target is deleted or trashed shows struck
  through; clicking it offers "Keep the name as text" or "Remove link". Nothing
  is rewritten until you choose.
- **Older build:** an unknown inline item makes the note open read-only
  (`checkBlocks`), as with the date chip; nothing is lost.

Fixture: `test-fixtures/note-links.vnote` (round-trips byte for byte in
`src/editor/doc-blocks.test.ts`).

## `select` (property type)

- **Where it lives:** an entry in the header's free-form `props`, like the other
  property types, with one extra field it owns: `options`, a list of strings.
  `{"Status":{"type":"select","value":"Open","options":["Open","Done"]}}`
- **Value:** a string, or `null` when nothing is picked. A value that is not in
  `options` is kept as it is and shown as "not an option"; it is never rewritten
  or dropped. Changing a text property to select keeps its value and adds it to
  `options`; changing back to text drops `options`.
- **Older build:** shows it as "select property: kept as it is" and leaves the
  entry untouched (the value is still a plain string for anything that reads
  `props`). A `select` entry whose `options` is missing or not a list of strings
  is treated the same way by this build.
- **Reflection:** Difficulty, Time spent, Help and Outcome on a task are written
  as `select` with their option lists. The older `text` form is still read and
  is upgraded the next time the reflection is saved.

Fixture: `test-fixtures/select-property.vnote` (round-trips byte for byte in
`src/core/notes/properties.test.ts`).

## `.vaultops/appearance.json`: per-part sidebar styles

- **Where it lives:** the vault settings file `.vaultops/appearance.json`, not a
  note format. Each `items[path]` entry may now carry `parts`: any of `icon`,
  `text`, `border`, `background`, each `{ "color": "red" | "#rrggbb", "alpha"?: 0..1 }`
  (`alpha` only for `background`). `icon` is now any lucide name.
- **Older files:** `tone` plus `mode` still load and paint the same; `school` and
  `file` icon ids still resolve.
- **Older build:** ignores `parts`. We still write `tone` and `mode` when one tone
  covers the parts, so those rows look the same there.
