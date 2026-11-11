import { FileText, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TrashedNote } from "../core/notes/trash";

export type TrashView = "cards" | "list";
const VIEW_KEY = "vaultops:trash-view";
export const loadTrashView = (): TrashView => {
	try {
		return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards";
	} catch {
		return "cards";
	}
};
export const saveTrashView = (view: TrashView) => {
	try {
		localStorage.setItem(VIEW_KEY, view);
	} catch {
		/* Not remembering is fine. */
	}
};

/**
 * Everything in the trash, as cards (the default) or a plain list; the choice is
 * remembered. Removing for good is still two steps: the first button only asks.
 */
export function TrashScreen({
	entries,
	view,
	onView,
	disabled,
	confirming,
	onConfirm,
	onRestore,
	onDelete,
}: {
	entries: TrashedNote[];
	view: TrashView;
	onView: (view: TrashView) => void;
	disabled: boolean;
	confirming: string | null;
	onConfirm: (path: string | null) => void;
	onRestore: (path: string) => void;
	onDelete: (path: string) => void;
}) {
	return (
		<section className="vault-screen trash-screen">
			<header className="trash-head">
				<h2>Trash</h2>
				<ToggleGroup
					type="single"
					aria-label="Trash layout"
					value={view}
					onValueChange={(next) => {
						// A click on the chosen layout does nothing; one is always on.
						if (next !== "cards" && next !== "list") return;
						onView(next);
					}}
				>
					<ToggleGroupItem value="cards" aria-label="Cards" title="Cards">
						<LayoutGrid aria-hidden="true" />
					</ToggleGroupItem>
					<ToggleGroupItem value="list" aria-label="List" title="List">
						<List aria-hidden="true" />
					</ToggleGroupItem>
				</ToggleGroup>
			</header>
			{entries.length === 0 && <p>The trash is empty.</p>}
			<div className="trash-items" data-view={view}>
				{entries.map((e) => (
					<article className="trash-item" key={e.trashPath}>
						<div className="trash-main">
							<strong className="trash-name">
								<FileText aria-hidden="true" />
								{e.originalPath.split("/").at(-1)}
							</strong>
							<p>{e.originalPath}</p>
							<p>
								{e.deletedAt
									? `Trashed on ${e.deletedAt.toLocaleString()}`
									: "Trash date unknown"}
							</p>
						</div>
						{confirming === e.trashPath ? (
							<div className="tree-confirm">
								<p>
									Remove this note from the trash? It stays on disk in
									.vaultops/recovery, where the app can't open it.
								</p>
								<Button
									size="sm"
									variant="destructive"
									disabled={disabled}
									onClick={() => onDelete(e.trashPath)}
								>
									Remove from trash
								</Button>{" "}
								<Button
									size="sm"
									variant="secondary"
									disabled={disabled}
									onClick={() => onConfirm(null)}
								>
									Cancel
								</Button>
							</div>
						) : (
							<div className="trash-actions">
								<Button
									size="sm"
									variant="secondary"
									disabled={disabled}
									onClick={() => onRestore(e.trashPath)}
								>
									Restore
								</Button>
								<Button
									size="sm"
									variant="outline"
									className="text-destructive"
									disabled={disabled}
									onClick={() => onConfirm(e.trashPath)}
								>
									Remove from trash
								</Button>
							</div>
						)}
					</article>
				))}
			</div>
		</section>
	);
}
