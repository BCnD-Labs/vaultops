import { FileText, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import { matchNoteTitles } from "../core/notes/quick-switch";
import type { NoteRow } from "./session";

/** Choose one note from a list, by title. Nothing is created or changed here. */
export function NotePickerDialog({
	open,
	onOpenChange,
	notes,
	title = "Choose a note",
	onPick,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	notes: NoteRow[];
	title?: string;
	onPick: (note: NoteRow) => void;
}) {
	const [query, setQuery] = useState("");
	const matches = matchNoteTitles(notes, query);
	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setQuery("");
			}}
			title={title}
			description="Search notes by title"
			shouldFilter={false}
		>
			<CommandInput
				aria-label={title}
				placeholder={`${title}...`}
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				{matches.length === 0 && <CommandEmpty>No notes found.</CommandEmpty>}
				{matches.length > 0 && (
					<CommandGroup heading="Notes">
						{matches.map((row) => (
							<CommandItem
								key={row.path}
								value={`note:${row.path}`}
								onSelect={() => {
									setQuery("");
									onPick(row);
								}}
							>
								{row.kind === "canvas" ? (
									<LayoutDashboard aria-hidden="true" />
								) : (
									<FileText aria-hidden="true" />
								)}{" "}
								{row.title}
								{row.kind === "canvas" && (
									<CommandShortcut>Canvas</CommandShortcut>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
