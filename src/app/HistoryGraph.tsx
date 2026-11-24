import { useMemo } from "react";
import { type GraphRow, layoutGraph } from "../core/history/graph";
import type { VcsLogEntry } from "../host/host";

/** Lane colours, in order; they repeat for very busy histories. */
const LANE_TONES = [
	"blue",
	"purple",
	"green",
	"orange",
	"pink",
	"teal",
	"red",
	"yellow",
];
const COL = 14;
const ROW = 36;
const MID = ROW / 2;
const x = (col: number) => col * COL + 10;
const tone = (color: number) =>
	`var(--tone-${LANE_TONES[color % LANE_TONES.length]})`;

function Lanes({ row, width }: { row: GraphRow; width: number }) {
	const w = width * COL + 8;
	return (
		<svg
			className="history-lanes"
			width={w}
			height={ROW}
			viewBox={`0 0 ${w} ${ROW}`}
			aria-hidden="true"
		>
			{row.top.map((s) => (
				<line
					key={`t${s.from}-${s.to}`}
					x1={x(s.from)}
					y1={0}
					x2={x(s.to)}
					y2={MID}
					stroke={tone(s.color)}
				/>
			))}
			{row.bottom.map((s) => (
				<line
					key={`b${s.from}-${s.to}`}
					x1={x(s.from)}
					y1={MID}
					x2={x(s.to)}
					y2={ROW}
					stroke={tone(s.color)}
				/>
			))}
			<circle cx={x(row.col)} cy={MID} r={4.5} fill={tone(row.color)} />
		</svg>
	);
}

const when = (iso: string) => {
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? iso
		: date.toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			});
};

/**
 * Save points as a graph, GitKraken style: one row each, with coloured lanes
 * showing where branches split off and join, and branch names on their tips.
 */
export function HistoryGraph({ entries }: { entries: VcsLogEntry[] }) {
	const rows = useMemo(() => layoutGraph(entries), [entries]);
	const width = Math.max(1, ...rows.map((r) => r.width));
	return (
		<ol className="history-graph" aria-label="History graph">
			{entries.map((entry, i) => {
				const row = rows[i] as GraphRow;
				return (
					<li
						key={entry.id}
						className="history-graph-row"
						aria-current={entry.head ? "true" : undefined}
					>
						<Lanes row={row} width={width} />
						<span className="history-graph-text">
							{entry.branches.map((name) => (
								<span
									key={name}
									className="history-branch"
									style={{ borderColor: tone(row.color) }}
								>
									{name}
								</span>
							))}
							<span className="history-subject">{entry.subject}</span>
							<span className="history-detail">
								<time dateTime={entry.date}>{when(entry.date)}</time> ·{" "}
								{entry.author}
							</span>
						</span>
					</li>
				);
			})}
		</ol>
	);
}
