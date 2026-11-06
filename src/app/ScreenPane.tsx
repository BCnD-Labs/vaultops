import { Button } from "@/components/ui/button";
import type { TrashedNote } from "../core/notes/trash";
import type { Host } from "../host/host";
import { PlannerScreen } from "./planner/PlannerScreen";
import { HealthScreen } from "./HealthScreen";
import { SettingsScreen } from "./SettingsScreen";
import type { VaultView } from "./session";
import { TrashScreen } from "./TrashScreen";
import type { UpdateHost } from "./UpdateSection";
import "./pane.css";

interface ScreenPaneProps {
	view: VaultView | null;
	screen: "trash" | "health" | "settings" | "planner";
	error: string | null;
	busy: boolean;
	writable: boolean;
	screenNotice: string | null;
	/** STOPGAP(update-script): what the Settings update button talks to. */
	updateHost: UpdateHost;
	trash: TrashedNote[];
	confirmDelete: string | null;
	onNavigate: (screen: "note") => void;
	onConfirmDelete: (path: string | null) => void;
	onRestore: (path: string) => void;
	onDelete: (path: string) => void;
	onOpen: (path: string) => void;
	/** The vault host planner writes go through (refuses writes when read-only). */
	host: Host;
	onPlannerChanged: (paths: string[]) => Promise<void>;
}

/**
 * Trash, vault health and settings: the screens that take the place of the
 * editor panes. The panes (and the notes open in them) stay as they were, so
 * "Back to notes" returns to the same tabs.
 */
export function ScreenPane({
	view,
	screen,
	error,
	busy,
	writable,
	screenNotice,
	updateHost,
	trash,
	confirmDelete,
	onNavigate,
	onConfirmDelete,
	onRestore,
	onDelete,
	onOpen,
	host,
	onPlannerChanged,
}: ScreenPaneProps) {
	if (screen === "planner") {
		return (
			<main className="pane planner-pane">
				{error && (
					<p role="alert" className="notice">
						Something went wrong: {error}
					</p>
				)}
				<PlannerScreen
					notes={view?.notes ?? []}
					host={host}
					writable={writable}
					onChanged={onPlannerChanged}
					onOpenNote={onOpen}
				/>
			</main>
		);
	}
	return (
		<main className="pane">
			{error && (
				<p role="alert" className="notice">
					Something went wrong: {error}
				</p>
			)}
			<Button
				size="sm"
				variant="secondary"
				disabled={busy}
				onClick={() => onNavigate("note")}
			>
				Back to notes
			</Button>
			{screenNotice && (
				<p role="status" className="notice">
					{screenNotice}
				</p>
			)}
			{screen === "trash" && (
				<TrashScreen
					entries={trash}
					disabled={busy || !writable}
					confirming={confirmDelete}
					onConfirm={onConfirmDelete}
					onRestore={(p) => onRestore(p)}
					onDelete={(p) => onDelete(p)}
				/>
			)}
			{screen === "health" && view && (
				<HealthScreen report={view.report} onOpen={onOpen} />
			)}
			{screen === "settings" && <SettingsScreen host={updateHost} />}
		</main>
	);
}
