import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { createRowTitle, matchNoteTitles } from "../core/notes/quick-switch";
import { type CommandContext, filterCommands, groupCommands } from "./commands";
import type { NoteRow } from "./session";

/** The commands the bar always has, by name (the reading command needs a note). */
export const COMMAND_ACTIONS = [
	"New folder",
	"Toggle left sidebar",
	"Toggle right sidebar",
	"Open Trash",
	"Open Vault health",
] as const;

export function commandShortcut(
	event: Pick<
		KeyboardEvent,
		| "key"
		| "metaKey"
		| "ctrlKey"
		| "altKey"
		| "shiftKey"
		| "isComposing"
		| "repeat"
	>,
	mac: boolean,
): boolean {
	return (
		event.key.toLowerCase() === "k" &&
		!event.altKey &&
		!event.shiftKey &&
		!event.isComposing &&
		!event.repeat &&
		(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)
	);
}

/** Whether this is a Mac (the key hint says Cmd there and Ctrl elsewhere). */
export function isMacPlatform(): boolean {
	return (
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform)
	);
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
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const returnFocus = useRef<HTMLElement | null>(null);
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
			if (!commandShortcut(event, mac)) return;
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
	const context: CommandContext = {
		onNewFolder,
		onToggle,
		onNavigate,
		onToggleReading,
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
					{createTitle && writable && (
						<CommandItem
							value={`create:${createTitle}`}
							onSelect={() =>
								closeAnd(() => onCreateNote(selectedFolder, createTitle))
							}
						>
							<FileText aria-hidden="true" /> Create note: {createTitle}
						</CommandItem>
					)}
					{matches.length > 0 && (
						<CommandGroup heading="Notes">
							{matches.map((row) => (
								<CommandItem
									key={row.path}
									value={`note:${row.path}`}
									onSelect={() => closeAnd(() => onOpenNote(row.path))}
								>
									<FileText aria-hidden="true" /> {row.title}
								</CommandItem>
							))}
						</CommandGroup>
					)}
					{groupCommands(filterCommands(query, context)).map((entry) => (
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
					))}
				</CommandList>
			</CommandDialog>
		</>
	);
}
