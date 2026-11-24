import { backlinks, linksIn } from "../core/links/links";
import { sortNotes } from "../core/notes/list";
import { headerProps } from "../core/notes/properties";
import { type ScannedNote, scanVault, searchTextOf } from "../core/notes/scan";
import { notesWithTag, tagsOf } from "../core/notes/tags";
import { validDateKey } from "../core/planner/dates";
import { dayOfLogPath, logPath, readLog } from "../core/planner/log";
import { listCards, loadTypes } from "../core/resources/resources";
import { searchFieldsOf } from "../core/search/fields";
import { createSearchIndex } from "../core/search/index";
import type { VaultReadHost } from "../host/host";

function noteSummary({ path, kind, preview, note, readOnly }: ScannedNote) {
	const { title, noteId } = note.header;
	return {
		path,
		noteId,
		kind,
		title:
			typeof title === "string" ? (title.trim() ? title : "Untitled") : path,
		preview,
		readOnly,
		tags: tagsOf(headerProps(note.header)),
	};
}

/** Read tools with JSON inputs and outputs. The transport can register them independently. */
export function createReadTools(host: VaultReadHost) {
	const scan = () => scanVault(host);
	return {
		async list_notes({ tag }: { tag?: string } = {}) {
			const { notes } = await scan();
			const summaries = notes.map(noteSummary);
			return sortNotes(
				tag ? notesWithTag(summaries, tag) : summaries,
				"name-asc",
			);
		},
		async search_notes({ query }: { query: string }) {
			const index = createSearchIndex();
			const { notes } = await scan();
			const idByPath = new Map(
				notes.map(({ path, note }) => [path, note.header.noteId]),
			);
			for (const scanned of notes) {
				index.add({
					...noteSummary(scanned),
					...searchFieldsOf(scanned.note),
					text: searchTextOf(scanned.note.blocks),
				});
			}
			return index
				.search(query)
				.map((hit) => ({ ...hit, noteId: idByPath.get(hit.path) ?? null }));
		},
		async read_note({ path }: { path: string }) {
			const { notes, report } = await scan();
			const health = report.find((entry) => entry.path === path);
			if (!health) return null;
			const scanned = notes.find((entry) => entry.path === path);
			return {
				health,
				note: scanned
					? {
							...noteSummary(scanned),
							header: scanned.note.header,
							blocks: scanned.note.blocks,
							properties: headerProps(scanned.note.header),
						}
					: null,
			};
		},
		async list_tags() {
			const { notes } = await scan();
			return [
				...new Set(
					notes.flatMap(({ note }) => tagsOf(headerProps(note.header))),
				),
			].sort();
		},
		async get_links({ path }: { path: string }) {
			const { notes } = await scan();
			const found = notes.find((entry) => entry.path === path);
			return found ? linksIn(found.note.blocks) : null;
		},
		get_backlinks({ noteId }: { noteId: string }) {
			return backlinks(host, noteId);
		},
		async list_journal_days() {
			const { report } = await scan();
			return report
				.flatMap(({ path }) => {
					const day = dayOfLogPath(path);
					return day ? [{ day, path }] : [];
				})
				.sort((a, b) => b.day.localeCompare(a.day));
		},
		async read_journal_day({ day }: { day: string }) {
			if (!validDateKey(day)) return null;
			const { notes, report } = await scan();
			const path = logPath(day);
			const health = report.find((entry) => entry.path === path);
			if (!health) return null;
			const found = notes.find((entry) => entry.path === path);
			return { day, health, sections: found ? readLog(found.note) : null };
		},
		async list_resources() {
			const [types, cards] = await Promise.all([
				loadTypes(host),
				listCards(host),
			]);
			return {
				types,
				cards: cards.map(
					({ header: _header, blocks: _blocks, props: _props, ...summary }) =>
						summary,
				),
			};
		},
		async read_resource({ path }: { path: string }) {
			return (await listCards(host)).find((card) => card.path === path) ?? null;
		},
		async vault_health() {
			return (await scan()).report;
		},
	};
}
