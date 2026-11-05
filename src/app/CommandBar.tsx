import {
	FileText,
	FolderPlus,
	HeartPulse,
	PanelLeft,
	PanelRight,
	Search,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	CommandDialog,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { createRowTitle, matchNoteTitles } from "../core/notes/quick-switch";
import type { NoteRow } from "./session";

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
					<CommandGroup heading="Actions">
						{COMMAND_ACTIONS.map((label, index) => {
							const icons = [
								FolderPlus,
								PanelLeft,
								PanelRight,
								Trash2,
								HeartPulse,
							];
							const Icon = icons[index] ?? Search;
							return (
								<CommandItem
									key={label}
									value={label}
									disabled={index === 0 && !writable}
									onSelect={() =>
										closeAnd(() => {
											if (index === 0) onNewFolder();
											else if (index === 1) onToggle("left");
											else if (index === 2) onToggle("right");
											else onNavigate(index === 3 ? "trash" : "health");
										})
									}
								>
									<Icon aria-hidden="true" /> {label}
								</CommandItem>
							);
						})}
					</CommandGroup>
				</CommandList>
			</CommandDialog>
		</>
	);
}
