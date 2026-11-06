import { Group, Trash2, Ungroup } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Block } from "../core/note-format";
import { deleteRoots } from "../core/notes/canvas-ops";

/** The small bar over a selection: group, ungroup, delete (after a confirmation). */
export function CanvasSelectionBar({
	ids,
	blocks,
	onGroup,
	onUngroup,
	onDelete,
}: {
	ids: string[];
	blocks: Block[];
	onGroup: (ids: string[]) => void;
	onUngroup: (id: string) => void;
	onDelete: (ids: string[]) => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const picked = blocks.filter((b) => b.id && ids.includes(b.id));
	const groups = picked.filter((b) => b.type === "group");
	const groupable = picked.filter(
		(b) => b.type !== "group" && b.type !== "connector",
	);
	let connectors = 0;
	try {
		connectors = deleteRoots(blocks, ids).connectorsRemoved;
	} catch {
		/* The selection changed under us; the bar is about to be redrawn. */
	}
	if (confirming) {
		const items = ids.length;
		return (
			<div
				className="canvas-selection-bar"
				role="toolbar"
				aria-label="Confirm delete"
			>
				<span>
					Delete {items} {items === 1 ? "item" : "items"}
					{connectors > 0
						? ` and ${connectors} ${connectors === 1 ? "connector" : "connectors"}`
						: ""}
					{groups.length > 0 ? " (a group's items stay)" : ""}?
				</span>
				<Button
					size="sm"
					variant="destructive"
					onClick={() => {
						setConfirming(false);
						onDelete(ids);
					}}
				>
					Delete
				</Button>
				<Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
					Cancel
				</Button>
			</div>
		);
	}
	return (
		<div className="canvas-selection-bar" role="toolbar" aria-label="Selection">
			<Button
				size="sm"
				variant="ghost"
				disabled={groupable.length < 2 || groups.length > 0}
				title={
					groups.length > 0
						? "Ungroup first"
						: groupable.length < 2
							? "Select at least two items"
							: "Group these items"
				}
				onClick={() => onGroup(groupable.map((b) => b.id as string))}
			>
				<Group aria-hidden="true" /> Group
			</Button>
			{groups.length === 1 && ids.length === 1 && (
				<Button
					size="sm"
					variant="ghost"
					onClick={() => onUngroup(groups[0]?.id as string)}
				>
					<Ungroup aria-hidden="true" /> Ungroup
				</Button>
			)}
			<Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
				<Trash2 aria-hidden="true" /> Delete
			</Button>
		</div>
	);
}
