import { Search } from "lucide-react";
import { useContext } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShellNavigation } from "./AppShell";
import { useCommandHint } from "./useSetting";

/**
 * The search icon in the left sidebar's top row, beside the new folder, canvas
 * and note buttons. It opens the same command dialog as Cmd/Ctrl K, through the
 * shell's `openSearch`.
 */
export function SearchButton() {
	const { openSearch } = useContext(ShellNavigation);
	const hint = useCommandHint("command-bar");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={openSearch}
					aria-label="Find or create a note"
				>
					<Search aria-hidden="true" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>Find or create{hint ? ` [${hint}]` : ""}</TooltipContent>
		</Tooltip>
	);
}
