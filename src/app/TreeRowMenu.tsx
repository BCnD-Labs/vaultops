import type { LucideIcon } from "lucide-react";
import { type ComponentProps, type ReactElement, useRef } from "react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";

/** One action in a tree row's menu, or a divider between groups. */
export type TreeMenuEntry =
	| {
			label: string;
			icon: LucideIcon;
			run: () => void;
			danger?: boolean;
			/** Opens an inline name field or popover: runs after the menu has closed, so focus lands there. */
			editor?: boolean;
	  }
	| "separator";

function Entries({
	entries,
	disabled,
	later,
}: {
	entries: TreeMenuEntry[];
	disabled: boolean;
	later: { current: (() => void) | null };
}) {
	return entries.map((entry, i) =>
		entry === "separator" ? (
			// biome-ignore lint/suspicious/noArrayIndexKey: dividers have no identity; the list is rebuilt each render.
			<ContextMenuSeparator key={`sep-${i}`} />
		) : (
			<ContextMenuItem
				key={entry.label}
				variant={entry.danger ? "destructive" : "default"}
				disabled={disabled}
				onSelect={() => {
					if (entry.editor) later.current = entry.run;
					else entry.run();
				}}
			>
				<entry.icon aria-hidden="true" />
				{entry.label}
			</ContextMenuItem>
		),
	);
}

/** Right-click (or the keyboard's menu key, Shift+F10) on a tree row opens its actions. */
export function TreeRowMenu({
	entries,
	disabled,
	children,
	...trigger
}: {
	entries: TreeMenuEntry[];
	disabled: boolean;
	children: ReactElement;
} & Omit<ComponentProps<typeof ContextMenuTrigger>, "children" | "asChild">) {
	// An action that opens a field waits until the menu is gone: run earlier, the
	// menu's focus trap pulls focus back and the new field closes on blur.
	const later = useRef<(() => void) | null>(null);
	return (
		<ContextMenu>
			{/* Extra props (a popover anchor's ref) pass through to the row itself. */}
			<ContextMenuTrigger asChild {...trigger}>
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent
				onCloseAutoFocus={(e) => {
					const run = later.current;
					later.current = null;
					if (run) {
						e.preventDefault();
						run();
					}
				}}
			>
				<Entries entries={entries} disabled={disabled} later={later} />
			</ContextMenuContent>
		</ContextMenu>
	);
}
