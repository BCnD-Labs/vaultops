import { Contact, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { createRowTitle, matchNoteTitles } from "../core/notes/quick-switch";
import {
	type ResourceCard,
	type ResourceType,
	searchCards,
} from "../core/resources/resources";
import { createSearchIndex } from "../core/search";
import { type KeyEventLike, matchesBinding } from "../core/settings/shortcuts";
import { type CommandContext, filterCommands, groupCommands } from "./commands";
import type { NoteRow } from "./session";
import { commandMatches, isMacPlatform } from "./shortcuts";
import { useFeatures } from "./useFeature";

/** The commands the bar always has, by name (the reading command needs a note). */
export const COMMAND_ACTIONS = [
	"New folder",
	"Toggle left sidebar",
	"Toggle right sidebar",
	"Open Trash",
	"Open Vault health",
] as const;

export function commandShortcut(
	event: KeyEventLike,
	mac: boolean,
	binding = "Mod+K",
): boolean {
	return matchesBinding(event, binding, mac);
}

export { isMacPlatform };

const folderOf = (path: string) =>
	path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "Vault root";

function highlightedSnippet(snippet: string, ranges: [number, number][]) {
	const parts: React.ReactNode[] = [];
	let cursor = 0;
	for (const [start, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
		if (start < cursor || end <= start) continue;
		parts.push(
			snippet.slice(cursor, start),
			<mark key={start}>{snippet.slice(start, end)}</mark>,
		);
		cursor = end;
	}
	parts.push(snippet.slice(cursor));
	return <>{parts}</>;
}

export function CommandBar({
	notes,
	writable,
	selectedFolder,
	openRequest,
	onOpenNote,
	onCreateNote,
	onNewFolder,
	onToggle,
	onNavigate,
	onToggleReading,
	onOpenTemplates,
	onOpenResources,
	onMoveNote,
	resources = [],
	resourceTypes = [],
	onOpenResource,
}: {
	notes: NoteRow[];
	writable: boolean;
	selectedFolder: string;
	openRequest: number;
	onOpenNote: (path: string) => void;
	onCreateNote: (folder: string, title: string) => void;
	onNewFolder: () => void;
	onToggle: (side: "left" | "right") => void;
	onNavigate: (screen: "trash" | "health") => void;
	onToggleReading?: () => void;
	onOpenTemplates?: () => void;
	onOpenResources?: () => void;
	onMoveNote?: () => void;
	/** Cards are found by name and by what is on them, like notes are by title. */
	resources?: ResourceCard[];
	resourceTypes?: ResourceType[];
	onOpenResource?: (noteId: string) => void;
}) {
	const features = useFeatures();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const returnFocus = useRef<HTMLElement | null>(null);
	const searchIndex = useRef(createSearchIndex());
	const indexedRows = useRef(new Map<string, NoteRow>());
	const nextPaths = new Set(notes.map((row) => row.path));
	for (const path of indexedRows.current.keys())
		if (!nextPaths.has(path)) {
			searchIndex.current.remove(path);
			indexedRows.current.delete(path);
		}
	for (const row of notes) {
		if (indexedRows.current.get(row.path) === row) continue;
		searchIndex.current.add({
			path: row.path,
			title: row.title,
			text: row.text,
			tags: row.tags,
			headings: row.headings,
			properties: row.properties,
			updatedAt: row.updatedAt,
		});
		indexedRows.current.set(row.path, row);
	}
	const lastRequest = useRef(openRequest);
	const mac = isMacPlatform();
	const show = () => {
		if (!open)
			returnFocus.current = document.activeElement as HTMLElement | null;
		setQuery("");
		setOpen(true);
	};
	useEffect(() => {
		if (lastRequest.current !== openRequest) {
			lastRequest.current = openRequest;
			show();
		}
	});
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!commandMatches(event, "command-bar", mac)) return;
			event.preventDefault();
			show();
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	});
	const closeAnd = (action: () => void) => {
		returnFocus.current = null;
		setOpen(false);
		action();
	};
	const matches = matchNoteTitles(
		notes.filter((row) => row.kind !== "canvas"),
		query,
	);
	const createTitle = createRowTitle(query, matches);
	// Two notes with the same title: show where each one lives.
	const duplicateTitles = new Set<string>();
	const seenTitles = new Set<string>();
	for (const row of notes) {
		const key = row.title.toLowerCase();
		if (seenTitles.has(key)) duplicateTitles.add(key);
		seenTitles.add(key);
	}
	// Words inside notes, after the titles: what was typed may be in the text.
	const inNotes = searchIndex.current
		.search(query)
		.filter((hit) => hit.field !== "title")
		.slice(0, 8);
	// Cards show only once something is typed, so the empty bar stays short.
	const cardMatches =
		query.trim() === ""
			? []
			: searchCards(
					resources.filter((card) => !card.problem && card.noteId),
					query,
				).slice(0, 6);
	const createItem = createTitle ? (
		<CommandItem
			value={`create:${createTitle}`}
			onSelect={() => closeAnd(() => onCreateNote(selectedFolder, createTitle))}
		>
			<FileText aria-hidden="true" /> Create note: {createTitle}
		</CommandItem>
	) : null;
	const context: CommandContext = {
		onNewFolder,
		onToggle,
		onNavigate,
		onToggleReading,
		onOpenTemplates,
		onOpenResources,
		onMoveNote,
	};
	return (
		<>
			<CommandDialog
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setQuery("");
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					returnFocus.current?.focus();
				}}
				title="Find or create a note"
				description="Search notes and actions"
				shouldFilter={false}
			>
				<CommandInput
					aria-label="Find or create a note"
					placeholder="Find or create a note..."
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					{createTitle &&
						writable &&
						matches.length === 0 &&
						cardMatches.length === 0 &&
						createItem}
					{matches.length > 0 && (
						<CommandGroup heading="Notes">
							{matches.map((row) => (
								<CommandItem
									key={row.path}
									value={`note:${row.path}`}
									onSelect={() => closeAnd(() => onOpenNote(row.path))}
								>
									<FileText aria-hidden="true" /> {row.title}
									{duplicateTitles.has(row.title.toLowerCase()) && (
										<CommandShortcut>{folderOf(row.path)}</CommandShortcut>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{cardMatches.length > 0 && onOpenResource && (
						<CommandGroup heading="Resources">
							{cardMatches.map((card) => (
								<CommandItem
									key={card.path}
									value={`resource:${card.path}`}
									onSelect={() => closeAnd(() => onOpenResource(card.noteId))}
								>
									<Contact aria-hidden="true" /> {card.title}
									<CommandShortcut>
										{resourceTypes.find((t) => t.id === card.typeId)?.name ??
											""}
									</CommandShortcut>
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{createTitle &&
						writable &&
						(matches.length > 0 || cardMatches.length > 0) &&
						createItem}
					{inNotes.length > 0 && (
						<CommandGroup heading="In notes">
							{inNotes.map((hit) => (
								<CommandItem
									key={hit.path}
									value={`text:${hit.path}`}
									onSelect={() => closeAnd(() => onOpenNote(hit.path))}
								>
									<FileText aria-hidden="true" />
									<span className="command-hit">
										<span>{hit.title}</span>
										<span className="command-snippet">
											{highlightedSnippet(hit.snippet, hit.ranges)}
										</span>
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{groupCommands(filterCommands(query, context, features.state)).map(
						(entry) => (
							<CommandGroup key={entry.group} heading={entry.group}>
								{entry.commands.map((command) => (
									<CommandItem
										key={command.id}
										value={command.label}
										disabled={command.needsWrite === true && !writable}
										onSelect={() => closeAnd(() => command.run(context))}
									>
										<command.icon aria-hidden="true" /> {command.label}
									</CommandItem>
								))}
							</CommandGroup>
						),
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
