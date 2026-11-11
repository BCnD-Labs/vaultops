import {
	AlignCenterHorizontal,
	AlignCenterVertical,
	AlignEndHorizontal,
	AlignEndVertical,
	AlignHorizontalSpaceBetween,
	AlignStartHorizontal,
	AlignStartVertical,
	AlignVerticalSpaceBetween,
	ArrowDownToLine,
	ArrowUpToLine,
	BringToFront,
	Group,
	Layers,
	SendToBack,
	Trash2,
	Ungroup,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Block } from "../core/note-format";
import type { Arrange } from "../core/notes/canvas-arrange";
import { deleteRoots, type ItemTone } from "../core/notes/canvas-ops";
import type { Order } from "../core/notes/canvas-order";
import type { ShapeKind, TextSize } from "../core/notes/canvas-style";
import { CanvasStylePanel } from "./CanvasStylePanel";

const ORDER: readonly (readonly [Order, string, typeof Group])[] = [
	["front", "Bring to front", BringToFront],
	["forward", "Bring forward", ArrowUpToLine],
	["backward", "Send backward", ArrowDownToLine],
	["back", "Send to back", SendToBack],
];

/** Align needs two items to line up; distribute needs three to space. */
const ARRANGE: readonly (readonly [Arrange, string, typeof Group, number])[] = [
	["left", "Align left", AlignStartVertical, 2],
	["center", "Align centres horizontally", AlignCenterVertical, 2],
	["right", "Align right", AlignEndVertical, 2],
	["top", "Align top", AlignStartHorizontal, 2],
	["middle", "Align middles vertically", AlignCenterHorizontal, 2],
	["bottom", "Align bottom", AlignEndHorizontal, 2],
	[
		"distribute-horizontal",
		"Distribute horizontally",
		AlignHorizontalSpaceBetween,
		3,
	],
	[
		"distribute-vertical",
		"Distribute vertically",
		AlignVerticalSpaceBetween,
		3,
	],
];

/**
 * The small bar over a selection: align and distribute, group, ungroup, delete
 * (after a confirmation).
 */
export function CanvasSelectionBar({
	ids,
	blocks,
	onGroup,
	onUngroup,
	onDelete,
	onArrange,
	onTone,
	onShape,
	onTextSize,
	onOrder,
}: {
	ids: string[];
	blocks: Block[];
	onGroup: (ids: string[]) => void;
	onUngroup: (id: string) => void;
	onDelete: (ids: string[]) => void;
	/** Without it the align and distribute buttons are not shown. */
	onArrange?: (how: Arrange) => void;
	/** Without it the color section of the style panel is not shown. Gets only what can have a color. */
	onTone?: (ids: string[], tone: ItemTone) => void;
	/** Without it the shape section is not shown. Gets only shapes. */
	onShape?: (ids: string[], kind: ShapeKind) => void;
	/** Without it the text size section is not shown. Gets only what has text of a size. */
	onTextSize?: (ids: string[], size: TextSize) => void;
	/** Without it the order menu is not shown. Gets only what can be stacked. */
	onOrder?: (ids: string[], how: Order) => void;
}) {
	const [confirming, setConfirming] = useState(false);
	const picked = blocks.filter((b) => b.id && ids.includes(b.id));
	const groups = picked.filter((b) => b.type === "group");
	const groupable = picked.filter(
		(b) => b.type !== "group" && b.type !== "connector",
	);
	// Groups are frames behind everything and connectors are lines: neither stacks.
	const stackable = picked.filter(
		(b) => b.type !== "group" && b.type !== "connector",
	);
	// Connectors are not boxes on the canvas, so they are not arranged.
	const arrangeable = picked.filter((b) => b.type !== "connector");
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
			{onArrange &&
				ARRANGE.map(([how, label, Icon, needs]) => (
					<Button
						key={how}
						size="icon"
						variant="ghost"
						aria-label={label}
						disabled={arrangeable.length < needs}
						title={
							arrangeable.length < needs
								? `${label}: select at least ${needs} items`
								: label
						}
						onClick={() => onArrange(how)}
					>
						<Icon aria-hidden="true" />
					</Button>
				))}
			<CanvasStylePanel
				picked={picked}
				onTone={onTone}
				onShape={onShape}
				onTextSize={onTextSize}
			/>
			{onOrder && stackable.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="ghost" title="Change the stacking order">
							<Layers aria-hidden="true" /> Order
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						{ORDER.map(([how, label, Icon]) => (
							<DropdownMenuItem
								key={how}
								onSelect={() =>
									onOrder(
										stackable.map((b) => b.id as string),
										how,
									)
								}
							>
								<Icon aria-hidden="true" /> {label}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}
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
