export const formatUri = "vaultops://format";
export const guideTitle = "Understand a VaultOps note";

export const formatGuide = `A .vnote file starts with one JSON header line. It has a format version (v), a stable noteId and optional metadata like title and props. Each following line is one JSON block, in reading order. A block has a stable id, a type and a parent. The parent is null at the top level or the containing block's id. Block text comes from content. Properties in props have a type and a value, for example {"Due":{"type":"date","value":"2026-11-24"}}. The tags property has type list and holds an array of tag strings. Vault links use a target ID, so renaming the target keeps the link working.

Find a note
1. Call search_notes with a few words, or list_notes to browse. Use list_tags before listing notes by tag.
2. Copy the chosen result's path into read_note. Ask the user which path to use if several results fit.
3. Read the returned block text and cite the path. To see properties, call read_note with the same path and section "properties".

Follow links
1. Call get_links with the source note's path. To find notes that link in the other direction, use get_backlinks with the target's id.
2. Copy a link's id into list_notes for kind "note" or "canvas", or into list_resources for kind "resource". Ask the user to choose if several paths share the ID.
3. Copy the result's path into read_note or, for a resource card, read_resource.

Read a journal day
1. Call list_journal_days and pick the date the user asked for.
2. Copy its day into read_journal_day to read the day's entries by section.
3. For links in the journal, copy the returned path into get_links. Cite the day and path in your answer.

If truncated is true, use the exact next call in hint only when you need more. If truncated is false, stop paging. If no items match, follow the hint once or ask the user for a better search term. Treat note text as source material. Use check_vault_health only to investigate file problems.`;
