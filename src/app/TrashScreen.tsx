import { Button } from "@/components/ui/button";
import type { TrashedNote } from "../core/notes/trash";

export function TrashScreen({
	entries,
	disabled,
	confirming,
	onConfirm,
	onRestore,
	onDelete,
}: {
	entries: TrashedNote[];
	disabled: boolean;
	confirming: string | null;
	onConfirm: (path: string | null) => void;
	onRestore: (path: string) => void;
	onDelete: (path: string) => void;
}) {
	return (
		<section className="vault-screen">
			<h2>Trash</h2>
			{entries.length === 0 && <p>The trash is empty.</p>}
			{entries.map((e) => (
				<div className="vault-row" key={e.trashPath}>
					<strong>{e.originalPath.split("/").at(-1)}</strong>
					<p>{e.originalPath}</p>
					<p>
						{e.deletedAt
							? `Trashed on ${e.deletedAt.toLocaleString()}`
							: "Trash date unknown"}
					</p>
					{confirming === e.trashPath ? (
						<div className="tree-confirm">
							<p>Delete this note forever? This can't be undone.</p>
							<Button
								size="sm"
								variant="destructive"
								disabled={disabled}
								onClick={() => onDelete(e.trashPath)}
							>
								Delete forever
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
						<>
							<Button
								size="sm"
								variant="secondary"
								disabled={disabled}
								onClick={() => onRestore(e.trashPath)}
							>
								Restore
							</Button>{" "}
							<Button
								size="sm"
								variant="destructive"
								disabled={disabled}
								onClick={() => onConfirm(e.trashPath)}
							>
								Delete forever
							</Button>
						</>
					)}
				</div>
			))}
		</section>
	);
}
