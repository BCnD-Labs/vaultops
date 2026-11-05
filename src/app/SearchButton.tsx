import { Search } from "lucide-react";
import { useContext } from "react";
import { ShellNavigation } from "./AppShell";
import { isMacPlatform } from "./CommandBar";

/**
 * The "Find or create a note..." button at the top of the left sidebar. It opens
 * the same command dialog as Cmd/Ctrl K and the rail's Search item, through the
 * shell's `openSearch`.
 */
export function SearchButton() {
	const { openSearch } = useContext(ShellNavigation);
	return (
		<button
			type="button"
			className="sidebar-search"
			onClick={openSearch}
			aria-label="Find or create a note"
		>
			<Search aria-hidden="true" />
			<span>Find or create a note...</span>
			<kbd>[{isMacPlatform() ? "Cmd" : "Ctrl"} K]</kbd>
		</button>
	);
}
