import { FilePlus, LayoutDashboard, Search } from "lucide-react";
import { useContext } from "react";
import { Button } from "@/components/ui/button";
import { ShellNavigation } from "./AppShell";
import { isMacPlatform } from "./CommandBar";

/**
 * The empty tab: a blank editor space that offers the three ways to start
 * (a new note, a new canvas, or opening one that already exists). Opening or
 * creating anything replaces the empty tab with that tab.
 */
export function NewTab({
	writable,
	onCreateNote,
	onCreateCanvas,
}: {
	writable: boolean;
	onCreateNote: () => void;
	onCreateCanvas: () => void;
}) {
	const { openSearch } = useContext(ShellNavigation);
	return (
		<div className="new-tab">
			<p className="empty-pane">Pick a note, or start a new one.</p>
			<div className="new-tab-actions">
				<Button variant="secondary" disabled={!writable} onClick={onCreateNote}>
					<FilePlus aria-hidden="true" />
					Create a note
				</Button>
				<Button
					variant="secondary"
					disabled={!writable}
					onClick={onCreateCanvas}
				>
					<LayoutDashboard aria-hidden="true" />
					Create a canvas
				</Button>
				<Button variant="secondary" onClick={openSearch}>
					<Search aria-hidden="true" />
					Open a note or canvas
					<kbd>[{isMacPlatform() ? "Cmd" : "Ctrl"} K]</kbd>
				</Button>
			</div>
		</div>
	);
}
