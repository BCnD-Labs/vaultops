/**
 * Lanes for the history graph (pure), GitKraken style: each save point sits
 * in a column, and lines run from it to its parents. Works on any list of
 * commits given newest first with their parent ids, so the same layout serves
 * the vault and, later, code repos.
 *
 * For each row it returns the node's column and two sets of line segments:
 * `top` (from the row's top edge to the node's middle) and `bottom` (from the
 * middle to the bottom edge), as column pairs. Drawing them row by row gives
 * continuous lanes, branch-offs and merges.
 */

export interface GraphCommit {
	id: string;
	parents: string[];
}

export interface GraphSegment {
	from: number;
	to: number;
	/** Lane colour index (stable for a lane while it runs). */
	color: number;
}

export interface GraphRow {
	id: string;
	/** The node's column. */
	col: number;
	color: number;
	top: GraphSegment[];
	bottom: GraphSegment[];
	/** Columns in use on this row, for the drawing's width. */
	width: number;
}

interface Lane {
	id: string;
	color: number;
}

export function layoutGraph(commits: readonly GraphCommit[]): GraphRow[] {
	let lanes: (Lane | null)[] = [];
	let nextColor = 0;
	const rows: GraphRow[] = [];
	for (const commit of commits) {
		const before = lanes.slice();
		let col = lanes.findIndex((l) => l?.id === commit.id);
		if (col < 0) {
			// A tip nobody pointed at yet: a new lane in the first free column.
			col = lanes.indexOf(null);
			if (col < 0) col = lanes.length;
			lanes[col] = { id: commit.id, color: nextColor++ };
		}
		const color = (lanes[col] as Lane).color;
		// Other lanes waiting for this commit end here (branches joining).
		lanes = lanes.map((l, i) => (i !== col && l?.id === commit.id ? null : l));
		const [first, ...others] = commit.parents;
		lanes[col] = first ? { id: first, color } : null;
		for (const parent of others) {
			if (lanes.some((l) => l?.id === parent)) continue;
			let free = lanes.indexOf(null);
			if (free < 0) free = lanes.length;
			lanes[free] = { id: parent, color: nextColor++ };
		}
		while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

		const top: GraphSegment[] = [];
		before.forEach((lane, i) => {
			if (!lane) return;
			top.push({
				from: i,
				to: lane.id === commit.id ? col : i,
				color: lane.color,
			});
		});
		const bottom: GraphSegment[] = [];
		lanes.forEach((lane, j) => {
			if (!lane) return;
			const fromNode =
				commit.parents.includes(lane.id) &&
				(j === col || before[j]?.id !== lane.id);
			bottom.push({ from: fromNode ? col : j, to: j, color: lane.color });
		});
		rows.push({
			id: commit.id,
			col,
			color,
			top,
			bottom,
			width: Math.max(before.length, lanes.length, col + 1),
		});
	}
	return rows;
}
