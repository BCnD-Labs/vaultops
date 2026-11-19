import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseFunctions } from "../core/plot/expression";
import {
	DEFAULT_XMAX,
	DEFAULT_XMIN,
	layoutPlot,
	normalizeRange,
	type PlotLayout,
	segmentsPath,
} from "../core/plot/layout";
import { useEditable } from "./math-block";
import "./plot-block.css";

export const DEFAULT_EXPR = "y = x^2";
export const PLOT_PLACEHOLDER = "Type a formula, like y = x^2";

/** A plot block's formulas: the text saved, or the starter formula if it is missing or not text. */
export function exprOf(value: unknown): string {
	return typeof value === "string" ? value : DEFAULT_EXPR;
}

function numberOf(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface ShownPlot {
	layout: PlotLayout;
	/** The formula text for each curve, in order. */
	sources: string[];
}

/** What a plot block draws for this text, and the first problem found, if any. */
export function computePlot(
	expr: string,
	xmin: number,
	xmax: number,
): { shown: ShownPlot | null; error: string | null } {
	const functions = parseFunctions(expr);
	const good = functions.flatMap((f) =>
		f.expr ? [{ ...f, expr: f.expr }] : [],
	);
	const error = functions.find((f) => f.error)?.error ?? null;
	if (!good.length) return { shown: null, error };
	return {
		shown: {
			layout: layoutPlot(
				good.map((f) => f.expr),
				xmin,
				xmax,
			),
			sources: good.map((f) => f.source),
		},
		error,
	};
}

const W = 480;
const H = 300;
const PAD = { left: 40, right: 12, top: 10, bottom: 24 };
const COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
];

function label(value: number): string {
	return String(Number(value.toPrecision(6)));
}

/** The graph itself, drawn as hand-written SVG in theme colours. */
export function PlotGraph({ shown }: { shown: ShownPlot }) {
	const clip = `plot-clip-${useId().replace(/\W/g, "")}`;
	const { layout } = shown;
	const px = (v: number) =>
		PAD.left +
		((v - layout.xmin) / (layout.xmax - layout.xmin)) *
			(W - PAD.left - PAD.right);
	const py = (v: number) =>
		H -
		PAD.bottom -
		((v - layout.ymin) / (layout.ymax - layout.ymin)) *
			(H - PAD.top - PAD.bottom);
	// Far-off points are pulled in so the path numbers stay small.
	const span = layout.ymax - layout.ymin;
	const py2 = (v: number) =>
		py(Math.max(layout.ymin - span * 5, Math.min(layout.ymax + span * 5, v)));
	return (
		<figure className="plot-figure">
			<svg
				className="plot-svg"
				viewBox={`0 0 ${W} ${H}`}
				role="img"
				aria-label={`Graph of ${shown.sources.join(", ")}`}
			>
				<defs>
					<clipPath id={clip}>
						<rect
							x={PAD.left}
							y={PAD.top}
							width={W - PAD.left - PAD.right}
							height={H - PAD.top - PAD.bottom}
						/>
					</clipPath>
				</defs>
				{layout.xticks.map((t) => (
					<g key={`x${t}`}>
						<line
							className="plot-grid"
							x1={px(t)}
							x2={px(t)}
							y1={PAD.top}
							y2={H - PAD.bottom}
						/>
						<text
							className="plot-tick"
							x={px(t)}
							y={H - PAD.bottom + 14}
							textAnchor="middle"
						>
							{label(t)}
						</text>
					</g>
				))}
				{layout.yticks.map((t) => (
					<g key={`y${t}`}>
						<line
							className="plot-grid"
							x1={PAD.left}
							x2={W - PAD.right}
							y1={py(t)}
							y2={py(t)}
						/>
						<text
							className="plot-tick"
							x={PAD.left - 4}
							y={py(t) + 3}
							textAnchor="end"
						>
							{label(t)}
						</text>
					</g>
				))}
				{layout.xmin < 0 && layout.xmax > 0 && (
					<line
						className="plot-axis"
						x1={px(0)}
						x2={px(0)}
						y1={PAD.top}
						y2={H - PAD.bottom}
					/>
				)}
				{layout.ymin < 0 && layout.ymax > 0 && (
					<line
						className="plot-axis"
						x1={PAD.left}
						x2={W - PAD.right}
						y1={py(0)}
						y2={py(0)}
					/>
				)}
				<g clipPath={`url(#${clip})`}>
					{layout.curves.map((segments, index) => (
						<path
							// biome-ignore lint/suspicious/noArrayIndexKey: curves have no identity
							key={index}
							className="plot-curve"
							d={segmentsPath(segments, px, py2)}
							stroke={COLORS[index % COLORS.length]}
						/>
					))}
				</g>
			</svg>
			{shown.sources.length > 1 && (
				<figcaption className="plot-legend">
					{shown.sources.map((source, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: the same formula may repeat
						<span key={index}>
							<i style={{ background: COLORS[index % COLORS.length] }} />
							{source}
						</span>
					))}
				</figcaption>
			)}
		</figure>
	);
}

function RangeField({
	name,
	value,
	onCommit,
}: {
	name: string;
	value: number;
	/** Saves the typed text and returns the number that is now in use. */
	onCommit: (text: string) => number;
}) {
	const [draft, setDraft] = useState(String(value));
	useEffect(() => setDraft(String(value)), [value]);
	const commit = () => setDraft(String(onCommit(draft)));
	return (
		<div className="plot-range">
			<span>{name}</span>
			<Input
				value={draft}
				inputMode="decimal"
				aria-label={name}
				onChange={(e) => setDraft(e.currentTarget.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === "Enter") commit();
				}}
			/>
		</div>
	);
}

function PlotView({ node, editor, getPos }: NodeViewProps) {
	const editable = useEditable(editor);
	const expr = exprOf(node.attrs.expr);
	const [xmin, xmax] = normalizeRange(
		numberOf(node.attrs.xmin, DEFAULT_XMIN),
		numberOf(node.attrs.xmax, DEFAULT_XMAX),
	);
	const { shown, error } = useMemo(
		() => computePlot(expr, xmin, xmax),
		[expr, xmin, xmax],
	);
	// While a formula has a typo, the last graph that worked stays on screen.
	const lastGood = useRef<ShownPlot | null>(null);
	if (shown && !error) lastGood.current = shown;
	const drawn = error ? (lastGood.current ?? shown) : shown;

	const change = (patch: Record<string, unknown>) => {
		const pos = getPos();
		if (typeof pos !== "number" || !editor.isEditable) return;
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				...patch,
			}),
		);
	};
	const commitRange = (side: "xmin" | "xmax", text: string): number => {
		const typed = text.trim() === "" ? Number.NaN : Number(text);
		const [low, high] = normalizeRange(
			side === "xmin" ? typed : xmin,
			side === "xmax" ? typed : xmax,
		);
		change({ xmin: low, xmax: high });
		return side === "xmin" ? low : high;
	};

	return (
		<NodeViewWrapper className="plot-block" contentEditable={false}>
			{editable && (
				<div className="plot-setup">
					<Textarea
						className="plot-input"
						rows={2}
						value={expr}
						spellCheck={false}
						placeholder={PLOT_PLACEHOLDER}
						aria-label="Formulas"
						aria-invalid={error ? true : undefined}
						onChange={(e) => change({ expr: e.currentTarget.value })}
					/>
					<div className="plot-ranges">
						<RangeField
							name="x from"
							value={xmin}
							onCommit={(text) => commitRange("xmin", text)}
						/>
						<RangeField
							name="to"
							value={xmax}
							onCommit={(text) => commitRange("xmax", text)}
						/>
					</div>
				</div>
			)}
			{error && (
				<p className="plot-error" role="alert">
					{error}
				</p>
			)}
			{drawn ? (
				<PlotGraph shown={drawn} />
			) : (
				!error && <p className="plot-empty">{PLOT_PLACEHOLDER}</p>
			)}
		</NodeViewWrapper>
	);
}

/** Put a plot block where the slash menu was. */
export function insertPlotBlock(
	editor: Editor,
	range: { from: number; to: number },
): boolean {
	return editor
		.chain()
		.focus()
		.deleteRange(range)
		.insertContent({ type: "plotBlock" })
		.run();
}

/**
 * A function plot. One line in the note,
 * `{"type":"plotBlock","attrs":{"expr":"y = sin(x)","xmin":-5,"xmax":5}}`:
 * only the formulas and the x range are saved, never the drawn graph. Each
 * attribute that still has its default (`y = x^2`, -10, 10) is left out.
 */
export const PlotBlock = Node.create({
	name: "plotBlock",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,

	addAttributes() {
		return {
			expr: {
				default: DEFAULT_EXPR,
				parseHTML: (el) => el.getAttribute("data-expr") ?? DEFAULT_EXPR,
				renderHTML: (attrs) => ({ "data-expr": exprOf(attrs.expr) }),
			},
			xmin: {
				default: DEFAULT_XMIN,
				parseHTML: (el) =>
					numberOf(Number(el.getAttribute("data-xmin")), DEFAULT_XMIN),
				renderHTML: (attrs) => ({
					"data-xmin": numberOf(attrs.xmin, DEFAULT_XMIN),
				}),
			},
			xmax: {
				default: DEFAULT_XMAX,
				parseHTML: (el) =>
					numberOf(Number(el.getAttribute("data-xmax")), DEFAULT_XMAX),
				renderHTML: (attrs) => ({
					"data-xmax": numberOf(attrs.xmax, DEFAULT_XMAX),
				}),
			},
		};
	},

	// Copied as plain text, a plot block is its formulas.
	renderText: ({ node }) => exprOf(node.attrs.expr),

	parseHTML() {
		return [{ tag: 'div[data-type="plot-block"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"div",
			mergeAttributes(HTMLAttributes, { "data-type": "plot-block" }),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(PlotView, {
			// The formula and range fields handle their own keys and mouse (a drag
			// of the block itself still goes to the editor).
			stopEvent: ({ event }) => {
				const target = event.target;
				return (
					target instanceof Element &&
					target.closest("input, textarea") !== null &&
					!event.type.startsWith("drag")
				);
			},
			ignoreMutation: () => true,
		});
	},
});
