import { LayoutTemplate, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { type SavedWorkspace, saveable } from "../core/workspace";
import { notify } from "../ui/notify";
import type { Command } from "./commands";
import { ConfirmDialog, NameDialog } from "./TemplateDialogs";
import type { WorkspaceHost } from "./useWorkspaceHost";

type Entry = { name: string; workspace: SavedWorkspace };
type Prompt =
	| { kind: "save"; name?: undefined }
	| { kind: "rename" | "replace" | "delete"; name: string };

const storageKey = (vault: string) => `vaultops:workspaces:${vault}`;

function read(vault: string): Entry[] {
	try {
		const entries: unknown = JSON.parse(
			localStorage.getItem(storageKey(vault)) ?? "[]",
		);
		if (!Array.isArray(entries)) return [];
		return entries.filter(
			(entry) =>
				typeof entry?.name === "string" &&
				[entry.workspace?.left, entry.workspace?.right].every(
					(tabs) =>
						Array.isArray(tabs) && tabs.every((tab) => typeof tab === "string"),
				),
		);
	} catch {
		return [];
	}
}

export function useSavedWorkspaces(
	vault: string | null,
	generation: number,
	host: WorkspaceHost,
	onSwitch: (workspace: SavedWorkspace) => void,
) {
	const [pending, setPending] = useState<{
		generation: number;
		prompt: Prompt;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const prompt = pending?.generation === generation ? pending.prompt : null;
	if (!vault) return null;
	const entries = read(vault);
	const ask = (prompt: Prompt) => {
		setError(null);
		setPending({ generation, prompt });
	};
	const close = () => setPending(null);
	const write = (next: Entry[]) => {
		try {
			localStorage.setItem(storageKey(vault), JSON.stringify(next));
			close();
		} catch {
			notify("Could not update saved workspaces on this Mac.");
		}
	};
	const save = (name: string) => {
		const entry = { name, workspace: saveable(host.workspace) };
		write(
			entries.some((item) => item.name === name)
				? entries.map((item) => (item.name === name ? entry : item))
				: [...entries, entry],
		);
	};
	const submit = (value: string) => {
		const name = value.trim();
		const exists = entries.some((entry) => entry.name === name);
		if (prompt?.kind === "rename") {
			if (name === prompt.name) close();
			else if (exists) setError("A workspace with this name already exists.");
			else
				write(
					entries.map((entry) =>
						entry.name === prompt.name ? { ...entry, name } : entry,
					),
				);
		} else if (exists) ask({ kind: "replace", name });
		else if (entries.length >= 20)
			setError("You can save up to 20 workspaces per vault.");
		else save(name);
	};
	const onSave = () => ask({ kind: "save" });
	const switches = entries.map(({ name, workspace }) => ({
		name,
		run: () => onSwitch(workspace),
	}));
	const commands: Command[] = [
		{
			id: "save-workspace",
			label: "Save workspace as…",
			group: "View",
			icon: LayoutTemplate,
			keywords: [],
			run: onSave,
		},
		...switches.flatMap(({ name, run }): Command[] => [
			{
				id: `switch-workspace:${name}`,
				label: `Switch workspace: ${name}`,
				group: "Go to",
				icon: LayoutTemplate,
				keywords: [],
				run,
			},
			{
				id: `rename-workspace:${name}`,
				label: `Rename workspace: ${name}`,
				group: "View",
				icon: Pencil,
				keywords: [],
				run: () => ask({ kind: "rename", name }),
			},
			{
				id: `delete-workspace:${name}`,
				label: `Delete workspace: ${name}`,
				group: "View",
				icon: Trash2,
				keywords: [],
				run: () => ask({ kind: "delete", name }),
			},
		]),
	];
	const replacing = prompt?.kind === "replace";
	return {
		commands,
		menu: { onSave, switches },
		dialog:
			prompt?.kind === "save" || prompt?.kind === "rename" ? (
				<NameDialog
					open
					title={
						prompt.kind === "rename" ? "Rename workspace" : "Save workspace as"
					}
					label="Workspace name"
					initial={prompt.name}
					confirmLabel={prompt.kind === "rename" ? "Rename" : "Save"}
					error={error}
					onSubmit={submit}
					onCancel={close}
				/>
			) : prompt ? (
				<ConfirmDialog
					open
					title={replacing ? "Replace workspace?" : "Delete workspace?"}
					description={
						replacing
							? `Save the current tabs as “${prompt.name}”?`
							: `Remove “${prompt.name}” from your saved workspaces?`
					}
					confirmLabel={replacing ? "Replace" : "Delete"}
					onConfirm={() =>
						replacing
							? save(prompt.name)
							: write(entries.filter((entry) => entry.name !== prompt.name))
					}
					onCancel={close}
				/>
			) : null,
	};
}

export type SavedWorkspaceMenu = NonNullable<
	ReturnType<typeof useSavedWorkspaces>
>["menu"];
