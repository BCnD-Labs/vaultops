import {
	BookOpen,
	FolderPlus,
	HeartPulse,
	type LucideIcon,
	PanelLeft,
	PanelRight,
	Trash2,
} from "lucide-react";

/** The groups the command list is divided into, in the order they appear. */
export const COMMAND_GROUPS = ["Create", "View", "Go to"] as const;
export type CommandGroup = (typeof COMMAND_GROUPS)[number];

/** What a command can do. A callback that is missing hides its commands. */
export interface CommandContext {
	onNewFolder: () => void;
	onToggle: (side: "left" | "right") => void;
	onNavigate: (screen: "trash" | "health") => void;
	onToggleReading?: () => void;
}

export interface Command {
	id: string;
	label: string;
	group: CommandGroup;
	icon: LucideIcon;
	/** Extra words that also find this command. */
	keywords: string[];
	/** Needs a vault that can be written to. */
	needsWrite?: boolean;
	/** Only offered when the context can do it. */
	available?: (context: CommandContext) => boolean;
	run: (context: CommandContext) => void;
}

/** Every command, one registry for the whole app. Add a command here and it appears in the bar. */
export const COMMANDS: Command[] = [
	{
		id: "new-folder",
		label: "New folder",
		group: "Create",
		icon: FolderPlus,
		keywords: ["create", "directory"],
		needsWrite: true,
		run: (c) => c.onNewFolder(),
	},
	{
		id: "toggle-left",
		label: "Toggle left sidebar",
		group: "View",
		icon: PanelLeft,
		keywords: ["files", "navigation", "hide", "show"],
		run: (c) => c.onToggle("left"),
	},
	{
		id: "toggle-right",
		label: "Toggle right sidebar",
		group: "View",
		icon: PanelRight,
		keywords: ["details", "outline", "hide", "show"],
		run: (c) => c.onToggle("right"),
	},
	{
		id: "toggle-reading",
		label: "Toggle reading view",
		group: "View",
		icon: BookOpen,
		keywords: ["read", "lock", "edit"],
		available: (c) => c.onToggleReading !== undefined,
		run: (c) => c.onToggleReading?.(),
	},
	{
		id: "open-trash",
		label: "Open Trash",
		group: "Go to",
		icon: Trash2,
		keywords: ["deleted", "restore"],
		run: (c) => c.onNavigate("trash"),
	},
	{
		id: "open-health",
		label: "Open Vault health",
		group: "Go to",
		icon: HeartPulse,
		keywords: ["check", "problems", "scan"],
		run: (c) => c.onNavigate("health"),
	},
];

/** The commands that can run now and match what was typed (all of them for nothing). */
export function filterCommands(
	query: string,
	context: CommandContext,
): Command[] {
	const q = query.trim().toLowerCase();
	return COMMANDS.filter((command) => {
		if (command.available && !command.available(context)) return false;
		if (q === "") return true;
		return (
			command.label.toLowerCase().includes(q) ||
			command.group.toLowerCase().startsWith(q) ||
			command.keywords.some((word) => word.toLowerCase().startsWith(q))
		);
	});
}

/** Commands under their group, groups in `COMMAND_GROUPS` order, empty groups left out. */
export function groupCommands(
	commands: Command[],
): { group: CommandGroup; commands: Command[] }[] {
	return COMMAND_GROUPS.map((group) => ({
		group,
		commands: commands.filter((command) => command.group === group),
	})).filter((entry) => entry.commands.length > 0);
}
