import type { Block, JsonValue } from "../note-format";
import { addConnector, addRoot } from "./canvas-ops";

/** A ready-made starting layout for a new canvas, built only from items every canvas already has. */
export interface CanvasTemplate {
	id: string;
	name: string;
	description: string;
	/** The blocks for a new canvas; every id comes from `newId`. */
	build: (newId: () => string) => Block[];
}

const STICKY = { w: 180, h: 140 };

/** Labels size themselves to their text; this is the room the templates leave for one. */
export const LABEL_ROOM = { w: 100, h: 32 };

type Attrs = { [k: string]: JsonValue };
type Spot = { x: number; y: number };

/** Top-left corner for an item of this size centred on `cx`, `cy`. */
function centred(cx: number, cy: number, w: number, h: number): Spot {
	return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2) };
}

function item(
	id: string,
	type: string,
	spot: Spot,
	size: { w: number; h: number } | null,
	text: string,
	extra: Attrs = {},
): Block {
	return {
		id,
		type,
		parent: null,
		attrs: { ...extra, ...(size ?? {}), x: spot.x, y: spot.y },
		...(text === "" ? {} : { content: [{ text, type: "text" }] }),
	};
}

function connect(
	blocks: Block[],
	pairs: [string, string][],
	newId: () => string,
): Block[] {
	return pairs.reduce(
		(all, [from, to]) => addConnector(all, from, to, newId()),
		blocks,
	);
}

function mindMap(newId: () => string): Block[] {
	const centre = { w: 220, h: 120 };
	const middle = newId();
	let blocks = addRoot(
		[],
		item(
			middle,
			"shape",
			centred(0, 0, centre.w, centre.h),
			centre,
			"Main idea",
			{
				shape: "ellipse",
				tone: "info",
			},
		),
	);
	const tones = ["note", "tip", "warning", "danger", "info"];
	const branches = tones.map((tone, i) => {
		const angle = ((-90 + i * 72) * Math.PI) / 180;
		const id = newId();
		blocks = addRoot(
			blocks,
			item(
				id,
				"sticky",
				centred(
					380 * Math.cos(angle),
					300 * Math.sin(angle),
					STICKY.w,
					STICKY.h,
				),
				STICKY,
				`Branch ${i + 1}`,
				tone === "note" ? {} : { tone },
			),
		);
		return id;
	});
	return connect(
		blocks,
		branches.map((id) => [middle, id]),
		newId,
	);
}

function flowchart(newId: () => string): Block[] {
	const pill = { w: 180, h: 90 };
	const diamond = { w: 220, h: 140 };
	const step = { w: 200, h: 90 };
	const start = newId();
	const decision = newId();
	const yes = newId();
	const no = newId();
	const end = newId();
	const shape = (
		id: string,
		spot: Spot,
		size: { w: number; h: number },
		text: string,
		kind?: string,
	) => item(id, "shape", spot, size, text, kind ? { shape: kind } : {});
	let blocks: Block[] = [
		shape(start, centred(0, 45, pill.w, pill.h), pill, "Start", "ellipse"),
		shape(
			decision,
			centred(0, 240, diamond.w, diamond.h),
			diamond,
			"Decision?",
			"diamond",
		),
		shape(yes, centred(-260, 445, step.w, step.h), step, "If yes, do this"),
		shape(no, centred(260, 445, step.w, step.h), step, "If no, do that"),
		shape(end, centred(0, 625, pill.w, pill.h), pill, "End", "ellipse"),
	];
	blocks = connect(
		blocks,
		[
			[start, decision],
			[decision, yes],
			[decision, no],
			[yes, end],
			[no, end],
		],
		newId,
	);
	// Path labels sit beside the middle of the two arrows leaving the decision.
	for (const [side, text] of [
		[-1, "Yes"],
		[1, "No"],
	] as const)
		blocks = addRoot(
			blocks,
			item(
				newId(),
				"label",
				centred(side * 190, 342, LABEL_ROOM.w, LABEL_ROOM.h),
				null,
				text,
			),
		);
	return blocks;
}

function timeline(newId: () => string): Block[] {
	const line = { w: 1120, h: 12 };
	let blocks = addRoot(
		[],
		item(newId(), "shape", { x: 0, y: 0 }, line, "", { tone: "info" }),
	);
	for (let i = 0; i < 5; i++) {
		const cx = 110 + i * 225;
		const above = i % 2 === 0;
		// The date sits between the line and its milestone.
		const note = above
			? centred(cx, -150, STICKY.w, STICKY.h)
			: centred(cx, 170, STICKY.w, STICKY.h);
		const date = centred(cx, above ? -40 : 56, LABEL_ROOM.w, LABEL_ROOM.h);
		blocks = addRoot(
			blocks,
			item(
				newId(),
				"sticky",
				note,
				STICKY,
				`Milestone ${i + 1}`,
				above ? {} : { tone: "tip" },
			),
		);
		blocks = addRoot(
			blocks,
			item(newId(), "label", date, null, `Date ${i + 1}`),
		);
	}
	return blocks;
}

function board(newId: () => string): Block[] {
	const frame = { w: 320, h: 280 };
	const frames: Block[] = [];
	const notes: Block[] = [];
	["To do", "Doing", "Done"].forEach((title, i) => {
		const spot = { x: i * 360, y: 0 };
		const noteId = newId();
		frames.push(
			item(newId(), "group", spot, frame, "", { members: [noteId], title }),
		);
		notes.push(
			item(
				noteId,
				"sticky",
				{ x: spot.x + 70, y: spot.y + 80 },
				STICKY,
				`Task ${i + 1}`,
			),
		);
	});
	// Frames come first so they sit behind the notes inside them.
	return [...frames, ...notes].reduce(
		(all, block) => addRoot(all, block),
		[] as Block[],
	);
}

export const CANVAS_TEMPLATES: CanvasTemplate[] = [
	{
		id: "mind-map",
		name: "Mind map",
		description: "A main idea in the middle with five branches around it.",
		build: mindMap,
	},
	{
		id: "flowchart",
		name: "Flowchart",
		description: "Start, a decision with a yes and a no path, and an end.",
		build: flowchart,
	},
	{
		id: "timeline",
		name: "Timeline",
		description: "A line with five dated milestones above and below.",
		build: timeline,
	},
	{
		id: "board",
		name: "Board",
		description: "To do, Doing and Done columns, each with a sticky note.",
		build: board,
	},
];
