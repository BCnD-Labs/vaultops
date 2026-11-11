import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { TrashedNote } from "../core/notes/trash";
import { HealthScreen } from "./HealthScreen";
import { PlannerScreen } from "./planner/PlannerScreen";
import type { VaultView } from "./session";
import { loadTrashView, saveTrashView, TrashScreen } from "./TrashScreen";
import "./pane.css";

interface ScreenPaneProps {
	view: VaultView | null;
	screen: "trash" | "health" | "planner";
	error: string | null;
	busy: boolean;
	writable: boolean;
	screenNotice: string | null;
	/** A note just restored: the notice offers to open it. */
	restoredPath?: string | null;
	trash: TrashedNote[];
	confirmDelete: string | null;
	onNavigate: (screen: "note") => void;
	onConfirmDelete: (path: string | null) => void;
	onRestore: (path: string) => void;
	onDelete: (path: string) => void;
	onOpen: (path: string) => void;
}

/**
 * Trash and vault health (and the planner): the screens that take the place of the
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
	restoredPath = null,
	trash,
	confirmDelete,
	onNavigate,
	onConfirmDelete,
	onRestore,
	onDelete,
	onOpen,
}: ScreenPaneProps) {
	const [trashView, setTrashView] = useState(loadTrashView);
	if (screen === "planner") {
		return (
			<main className="pane planner-pane">
				{error && (
					<p role="alert" className="notice">
						Something went wrong: {error}
					</p>
				)}
				<PlannerScreen />
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
				variant="ghost"
				className="screen-back"
				disabled={busy}
				onClick={() => onNavigate("note")}
			>
				<ArrowLeft aria-hidden="true" /> Back to notes
			</Button>
			{screenNotice && (
				<p role="status" className="notice">
					{screenNotice}
					{restoredPath && (
						<>
							{" "}
							<Button
								size="sm"
								variant="outline"
								onClick={() => onOpen(restoredPath)}
							>
								Open
							</Button>
						</>
					)}
				</p>
			)}
			{screen === "trash" && (
				<TrashScreen
					entries={trash}
					view={trashView}
					onView={(next) => {
						setTrashView(next);
						saveTrashView(next);
					}}
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
		</main>
	);
}
