import { Folder, FolderOpen } from "lucide-react";
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

/** The vault's top level, as a choice in the list. */
export const VAULT_ROOT = "Vault root";

/** Folders whose path contains what was typed, the vault root first when it fits. */
export function matchFolders(folders: readonly string[], query: string) {
	const q = query.trim().toLowerCase();
	const all = ["", ...[...folders].sort((a, b) => a.localeCompare(b))];
	return all.filter(
		(path) =>
			q === "" || (path === "" ? VAULT_ROOT : path).toLowerCase().includes(q),
	);
}

/**
 * Choose where a note goes. The note's own folder is shown but cannot be
 * chosen, so every pick is a real move. Nothing changes until one is picked.
 */
export function FolderPickerDialog({
	open,
	onOpenChange,
	folders,
	current,
	title = "Move to a folder",
	onPick,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	folders: readonly string[];
	/** The folder the note is in now ("" is the vault root). */
	current: string;
	title?: string;
	onPick: (folder: string) => void;
}) {
	const [query, setQuery] = useState("");
	const matches = matchFolders(folders, query);
	return (
		<CommandDialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) setQuery("");
			}}
			title={title}
			description="Search folders by name"
			shouldFilter={false}
		>
			<CommandInput
				aria-label={title}
				placeholder={`${title}...`}
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				{matches.length === 0 && <CommandEmpty>No folders found.</CommandEmpty>}
				{matches.length > 0 && (
					<CommandGroup heading="Folders">
						{matches.map((path) => (
							<CommandItem
								key={path || "(root)"}
								value={`folder:${path}`}
								disabled={path === current}
								onSelect={() => {
									setQuery("");
									onPick(path);
								}}
							>
								{path === "" ? (
									<FolderOpen aria-hidden="true" />
								) : (
									<Folder aria-hidden="true" />
								)}{" "}
								{path === "" ? VAULT_ROOT : path}
								{path === current && (
									<CommandShortcut>here now</CommandShortcut>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
