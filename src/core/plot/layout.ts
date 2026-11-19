import { type Expr, evaluate } from "./expression";

export const DEFAULT_XMIN = -10;
export const DEFAULT_XMAX = 10;
export const SAMPLES = 400;
/** Values past this are left out when choosing the height of the graph. */
export const Y_LIMIT = 1e6;

export type Point = readonly [number, number];
/** One continuous piece of a curve; a function with gaps has several. */
export type Segment = Point[];

/** The x range to draw: the one given, or the default when it makes no sense. */
export function normalizeRange(xmin: unknown, xmax: unknown): [number, number] {
	if (
		typeof xmin === "number" &&
		typeof xmax === "number" &&
		Number.isFinite(xmin) &&
		Number.isFinite(xmax) &&
		xmin < xmax &&
		Math.max(Math.abs(xmin), Math.abs(xmax)) <= Y_LIMIT
	)
		return [xmin, xmax];
	return [DEFAULT_XMIN, DEFAULT_XMAX];
}

/** Round axis values (1, 2 or 5 times a power of ten) between min and max. */
export function niceTicks(min: number, max: number, target = 6): number[] {
	const span = max - min;
	if (!(span > 0) || !Number.isFinite(span)) return [];
	const rough = span / target;
	const power = 10 ** Math.floor(Math.log10(rough));
	const unit = rough / power;
	const step = (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * power;
	const ticks: number[] = [];
	const first = Math.ceil(min / step - 1e-9);
	for (let i = first; i * step <= max + step * 1e-9; i++) {
		// Rounding away float noise such as 0.30000000000000004.
		ticks.push(Number((i * step).toPrecision(12)) + 0);
	}
	return ticks;
}

function percentile(sorted: number[], fraction: number): number {
	return (
		sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ??
		0
	);
}

/** The height to show: everything, unless a few huge values would squash the rest. */
export function autoYRange(values: readonly number[]): [number, number] {
	const sorted = values
		.filter((v) => Math.abs(v) <= Y_LIMIT)
		.sort((a, b) => a - b);
	if (!sorted.length) return [-10, 10];
	let lo = sorted[0] ?? 0;
	let hi = sorted[sorted.length - 1] ?? 0;
	const lowCut = percentile(sorted, 0.02);
	const highCut = percentile(sorted, 0.98);
	if (hi - lo > 4 * (highCut - lowCut)) {
		lo = lowCut;
		hi = highCut;
	}
	if (hi - lo < 1e-9) return [lo - 1, hi + 1];
	const pad = (hi - lo) * 0.08;
	return [lo - pad, hi + pad];
}

export interface PlotLayout {
	xmin: number;
	xmax: number;
	ymin: number;
	ymax: number;
	xticks: number[];
	yticks: number[];
	/** One list of segments per formula, in the order given (data coordinates). */
	curves: Segment[][];
}

/**
 * Samples every formula across the range, breaks each line where the value is
 * missing or jumps (like `tan` or `1/x`), and chooses the height to fit.
 */
export function layoutPlot(
	exprs: readonly Expr[],
	xmin: number,
	xmax: number,
	yRange?: readonly [number, number],
): PlotLayout {
	const [x0, x1] = normalizeRange(xmin, xmax);
	const samples = exprs.map((expr) => {
		const points: Point[] = [];
		for (let i = 0; i < SAMPLES; i++) {
			const x = x0 + ((x1 - x0) * i) / (SAMPLES - 1);
			points.push([x, evaluate(expr, x)]);
		}
		return points;
	});
	const [ymin, ymax] =
		yRange ??
		autoYRange(
			samples.flatMap((points) =>
				points.map(([, y]) => y).filter(Number.isFinite),
			),
		);
	const jump = (ymax - ymin) * 0.9;
	const curves = samples.map((points) => {
		const segments: Segment[] = [];
		let current: Segment = [];
		for (const point of points) {
			const last = current[current.length - 1];
			if (!Number.isFinite(point[1])) {
				if (current.length) segments.push(current);
				current = [];
			} else if (last && Math.abs(point[1] - last[1]) > jump) {
				segments.push(current);
				current = [point];
			} else current.push(point);
		}
		if (current.length) segments.push(current);
		return segments.filter((segment) => segment.length > 1);
	});
	return {
		xmin: x0,
		xmax: x1,
		ymin,
		ymax,
		xticks: niceTicks(x0, x1),
		yticks: niceTicks(ymin, ymax),
		curves,
	};
}

/** Turns segments into an SVG path, mapping data to pixels with `x` and `y`. */
export function segmentsPath(
	segments: readonly Segment[],
	x: (value: number) => number,
	y: (value: number) => number,
): string {
	return segments
		.map((segment) =>
			segment
				.map(
					([px, py], i) =>
						`${i ? "L" : "M"}${x(px).toFixed(1)} ${y(py).toFixed(1)}`,
				)
				.join(" "),
		)
		.join(" ");
}
