import {
	ChevronsUpDown,
	Contact,
	FolderOpen,
	LayoutTemplate,
	Settings,
	Trash2,
	Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export interface VaultMenuProps {
	/** The open vault's name, or null when none is open. */
	vault: string | null;
	busy: boolean;
	/** A vault is open, so its managers and trash can be reached. */
	hasVault: boolean;
	maintainer: boolean;
	onChooseVault: () => void;
	onOpenResources?: () => void;
	onOpenTemplates?: () => void;
	onOpenTrash: () => void;
	onShowMaintainer: () => void;
	onOpenSettings: () => void;
}

/**
 * The bottom row of the left sidebar: the vault menu (switch vault, then the
 * vault's managers and trash) and the settings button beside it. The menu
 * opens upward, the way Obsidian's vault switcher does.
 */
export function VaultMenu({
	vault,
	busy,
	hasVault,
	maintainer,
	onChooseVault,
	onOpenResources,
	onOpenTemplates,
	onOpenTrash,
	onShowMaintainer,
	onOpenSettings,
}: VaultMenuProps) {
	return (
		<footer className="sidebar-foot">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="vault-switch"
						aria-label={`Vault menu: ${vault ?? "no vault open"}`}
						disabled={busy}
					>
						<span className="vault-switch-name">{vault ?? "No vault"}</span>
						<ChevronsUpDown className="tree-icon" aria-hidden="true" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="top"
					align="start"
					className="vault-menu"
					aria-label="Vault"
				>
					<DropdownMenuLabel className="vault-menu-label">
						{vault ?? "No vault open"}
					</DropdownMenuLabel>
					<DropdownMenuItem onSelect={onChooseVault}>
						<FolderOpen aria-hidden="true" />
						{hasVault ? "Change vault…" : "Open a vault…"}
					</DropdownMenuItem>
					{hasVault && (
						<>
							<DropdownMenuSeparator />
							{onOpenResources && (
								<DropdownMenuItem onSelect={onOpenResources}>
									<Contact aria-hidden="true" />
									Resource manager
								</DropdownMenuItem>
							)}
							{onOpenTemplates && (
								<DropdownMenuItem onSelect={onOpenTemplates}>
									<LayoutTemplate aria-hidden="true" />
									Template manager
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onSelect={onOpenTrash}>
								<Trash2 aria-hidden="true" />
								Trash
							</DropdownMenuItem>
						</>
					)}
					{maintainer && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={onShowMaintainer}>
								<Wrench aria-hidden="true" />
								Developer
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="sidebar-foot-settings"
						aria-label="Settings"
						onClick={onOpenSettings}
					>
						<Settings aria-hidden="true" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="top">Settings</TooltipContent>
			</Tooltip>
		</footer>
	);
}
