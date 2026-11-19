import { createContext, useState } from "react";
import {
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import type { Block } from "../core/note-format";
import type { OutlineItem } from "../core/notes/outline";
import { matchNoteTitles } from "../core/notes/quick-switch";
import { suggestDestinations } from "../core/notes/send-to";
import { logPath } from "../core/planner/log";
import type { NoteRow } from "./session";
import type { SendDestination } from "./useWorkspaceHost";

export const SendToBlock = createContext<
	((noteId: string, block: Block) => void) | null
>(null);

export function SendToDialog({
	block,
	source,
	notes,
	recent,
	today,
	headings,
	close,
	send,
}: {
	block: Block;
	source: NoteRow;
	notes: NoteRow[];
	recent: string[];
	today: string;
	headings: (path: string) => Promise<OutlineItem[]>;
	close: () => void;
	send: (destination: SendDestination) => void;
}) {
	const [query, setQuery] = useState("");
	const [target, setTarget] = useState<NoteRow>();
	const [sections, setSections] = useState<{
		path: string;
		items: OutlineItem[];
	}>();
	const eligible = notes.filter(
		(row) => !row.readOnly && row.path !== source.path,
	);
	const suggested = suggestDestinations(
		block,
		source,
		eligible,
		recent,
		today,
	).flatMap((item) =>
		item.kind === "note"
			? eligible.filter((row) => row.path === item.path)
			: [],
	);
	const matches = matchNoteTitles(eligible, query);
	const row = (note: NoteRow) => (
		<CommandItem
			key={note.path}
			value={note.path}
			onSelect={() => {
				if (note.kind === "canvas")
					return send({ kind: "note", path: note.path });
				setTarget(note);
				setQuery("");
				void headings(note.path).then(
					(items) => setSections({ path: note.path, items }),
					() => {},
				);
			}}
		>
			{note.title || note.path}
		</CommandItem>
	);
	const actions = [
		...(source.path === logPath(today)
			? []
			: ([{ kind: "journal", title: "Today's journal" }] as const)),
		{ kind: "new", title: "New note" },
		...(source.kind === "canvas"
			? []
			: ([{ kind: "link", title: "New note and leave a link" }] as const)),
		{ kind: "task", title: "New planner task" },
	] as const;
	const includes = (title: string) =>
		title.toLowerCase().includes(query.trim().toLowerCase());
	return (
		<CommandDialog
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
			title="Send block to…"
			description="Choose a destination for this block"
			shouldFilter={false}
		>
			<CommandInput
				aria-label={target ? "Search sections" : "Search destinations"}
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				{target ? (
					<>
						{!query && (
							<CommandItem
								onSelect={() => send({ kind: "note", path: target.path })}
							>
								Send to {target.title}
							</CommandItem>
						)}
						<CommandGroup heading="Into this section">
							{sections?.path === target.path &&
								sections.items.map(
									({ id, text }) =>
										id &&
										includes(text) && (
											<CommandItem
												key={id}
												value={id}
												onSelect={() =>
													send({ kind: "note", path: target.path, heading: id })
												}
											>
												{text}
											</CommandItem>
										),
								)}
						</CommandGroup>
						<CommandItem
							onSelect={() => {
								setTarget(undefined);
								setSections(undefined);
								setQuery("");
							}}
						>
							Back to destinations
						</CommandItem>
					</>
				) : (
					<>
						{!query && (
							<CommandGroup heading="Suggestions">
								{suggested.map(row)}
							</CommandGroup>
						)}
						<CommandGroup heading="Notes">
							{matches
								.filter((note) => query || !suggested.includes(note))
								.map(row)}
						</CommandGroup>
						{actions.map(
							({ kind, title }) =>
								includes(title) && (
									<CommandItem
										key={kind}
										value={kind}
										onSelect={() => send({ kind })}
									>
										{title}
									</CommandItem>
								),
						)}
					</>
				)}
			</CommandList>
		</CommandDialog>
	);
}
