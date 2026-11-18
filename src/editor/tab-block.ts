import type { NodeViewRendererProps } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import {
	columnX,
	layoutTab,
	parseTab,
	TAB,
	type TabMark,
	type TabRow,
	type TabSheet,
} from "../core/music/tab";
import { hiddenSources } from "./mermaid-block";

/** Pause after the last keystroke before the tab is drawn again. */
const DELAY = 250;

const esc = (text: string) =>
	text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** One technique mark, drawn above or along its string. */
function markSvg(mark: TabMark, row: TabRow, y: number, top: number): string {
	const x = (col: number) => columnX(row, col);
	if (mark.kind === "bend") {
		const bx = x(mark.col) + 5;
		const tip = top - 8;
		return `<path class="tab-arc" d="M${bx - 1} ${y} Q${bx + 7} ${y} ${bx + 7} ${tip}M${bx + 4} ${tip + 4}L${bx + 7} ${tip}L${bx + 10} ${tip + 4}"/><text class="tab-label" x="${bx + 7}" y="${tip - 4}">${esc(mark.label)}</text>`;
	}
	if (mark.kind === "vibrato") {
		const x1 = x(mark.from) - 3;
		const waves = Math.max(1, Math.round((x(mark.to) + 3 - x1) / 6));
		return `<path class="tab-arc" d="M${x1} ${y - 8}${" q1.5 -3 3 0 q1.5 3 3 0".repeat(waves)}"/>`;
	}
	const x1 = Math.max(x(mark.from), TAB.left - 8);
	const x2 = x(Math.min(mark.to, row.end - 0.5));
	if (mark.kind === "slide") {
		const d = mark.down ? -3 : 3;
		return `<path class="tab-arc" d="M${x1 + 5} ${y + d}L${x2 - 5} ${y - d}"/>`;
	}
	if (mark.kind === "release") {
		return `<path class="tab-arc" d="M${x1 + 12} ${top - 8}Q${x2 - 3} ${top - 8} ${x2 - 3} ${y - 6}M${x2 - 6} ${y - 10}L${x2 - 3} ${y - 6}L${x2} ${y - 10}"/>`;
	}
	const mid = (x1 + x2) / 2;
	const label = mark.kind === "hammer" ? "H" : "P";
	return `<path class="tab-arc" d="M${x1 + 3} ${y - 6}Q${mid} ${y - 14} ${x2 - 3} ${y - 6}"/><text class="tab-label" x="${mid}" y="${y - 14}">${label}</text>`;
}

/** The whole sheet as one SVG: string lines, TAB clef, frets, bars and marks. */
export function tabSvg(sheet: TabSheet, width: number): string {
	const { rows, height } = layoutTab(sheet, width);
	const out: string[] = [];
	let right = 0;
	for (const row of rows) {
		const { system, start, end } = row;
		const inRow = (col: number) => col >= start && col < end;
		const yOf = (s: number) => row.y + TAB.top + s * TAB.string;
		const top = yOf(0);
		const bottom = yOf(system.strings.length - 1);
		const edge = columnX(row, end - 1) + TAB.col / 2;
		right = Math.max(right, edge);
		const line = (x: number, cls: string) =>
			`<line class="${cls}" x1="${x}" x2="${x}" y1="${top}" y2="${bottom}"/>`;
		system.strings.forEach((name, s) => {
			out.push(
				`<line class="tab-string" x1="16" x2="${edge}" y1="${yOf(s)}" y2="${yOf(s)}"/>`,
				`<text class="tab-name" x="7" y="${yOf(s)}">${esc(name)}</text>`,
			);
		});
		out.push(line(16, "tab-bar"));
		const step = (bottom - top) / 3;
		["T", "A", "B"].forEach((letter, k) => {
			const y = (top + bottom) / 2 + (k - 1) * step;
			out.push(
				`<text class="tab-clef" x="29" y="${y}" font-size="${Math.min(15, step * 1.05)}">${letter}</text>`,
			);
		});
		for (const bar of system.bars.filter(inRow))
			out.push(line(columnX(row, bar), "tab-bar"));
		for (const mark of system.marks) {
			const at = mark.kind === "bend" ? mark.col : mark.from;
			// A slide into a row's first note starts just before the row.
			if (inRow(at) || (mark.kind === "slide" && inRow(mark.to)))
				out.push(markSvg(mark, row, yOf(mark.string), top));
		}
		for (const note of system.notes.filter((n) => inRow(n.col))) {
			const x = columnX(row, note.col + (note.text.length - 1) / 2);
			out.push(
				`<text class="tab-fret" x="${x}" y="${yOf(note.string)}">${esc(note.text)}</text>`,
			);
		}
		for (const label of system.labels.filter((l) => inRow(l.col))) {
			const x = columnX(row, label.col) - TAB.col / 2;
			out.push(
				`<text class="tab-chord" x="${x}" y="${row.y + 13}">${esc(label.text)}</text>`,
			);
		}
	}
	const w = Math.ceil(right + 8);
	return `<svg xmlns="http://www.w3.org/2000/svg" class="tab-svg" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="Guitar tab">${out.join("")}</svg>`;
}

/** What the quiet note under the drawing says about lines it did not draw. */
export function unreadMessage(sheet: TabSheet, empty: boolean): string {
	if (empty) return "Type tab lines, such as: e|---0---3---|";
	if (!sheet.unread.length) return "";
	const shown = sheet.unread.slice(0, 3).map((line) => `“${line.trim()}”`);
	const more =
		sheet.unread.length > 3 ? ` and ${sheet.unread.length - 3} more` : "";
	return `Not drawn, kept in the text: ${shown.join(", ")}${more}`;
}

const isTab = (node: PMNode) =>
	node.type.name === "codeBlock" && node.attrs.language === "tab";

const element = (tag: string, className: string) => {
	const made = document.createElement(tag);
	made.className = className;
	return made;
};

/**
 * A code block whose language is `tab`: its text on the left and the drawn tab
 * on the right (stacked when narrow), with a switch to show the drawing only.
 * It shares the Mermaid block's layout, styles and remembered switch. Any other
 * code block gets null.
 */
export function tabNodeView({
	node,
	view,
	getPos,
}: NodeViewRendererProps): NodeView | null {
	const toDOM = node.type.spec.toDOM;
	if (!isTab(node) || !toDOM) return null;
	let current = node;
	const rendered = DOMSerializer.renderSpec(document, toDOM(node));
	const pre = rendered.dom as HTMLElement;
	const contentDOM = rendered.contentDOM ?? pre;

	const dom = element("div", "mermaid-block tab-block");
	const grid = dom.appendChild(element("div", "mermaid-grid"));
	const panel = element("div", "mermaid-view");
	panel.contentEditable = "false";
	grid.append(pre, panel);
	const toggle = panel.appendChild(element("button", "mermaid-toggle"));
	const canvas = panel.appendChild(element("div", "mermaid-svg"));
	const message = panel.appendChild(element("p", "mermaid-error"));

	const id = () => String(current.attrs.id ?? "");
	const showSource = (hidden: boolean) => {
		dom.dataset.source = hidden ? "hidden" : "shown";
		toggle.setAttribute("aria-pressed", String(hidden));
		toggle.textContent = hidden ? "Show text" : "Tab only";
	};
	showSource(hiddenSources().includes(id()));

	toggle.addEventListener("mousedown", (event) => event.preventDefault());
	toggle.addEventListener("click", () => {
		const hidden = dom.dataset.source !== "hidden";
		showSource(hidden);
		const rest = hiddenSources().filter((item) => item !== id());
		if (id()) hiddenSources(hidden ? [...rest, id()] : rest);
		// Hidden text can't be typed into: the caret moves past the drawing.
		const pos = getPos();
		const { selection, doc, tr } = view.state;
		if (!hidden || typeof pos !== "number") return;
		const end = pos + current.nodeSize;
		if (selection.from > pos && selection.to < end) {
			view.dispatch(tr.setSelection(Selection.near(doc.resolve(end))));
		}
	});

	let drawn = "";
	let timer: ReturnType<typeof setTimeout> | undefined;
	const draw = () => {
		const text = current.textContent;
		// No layout (tests, hidden panes) falls back to a typical column width.
		const width = canvas.clientWidth || 640;
		const key = `${width}\n${text}`;
		if (key === drawn) return;
		drawn = key;
		const sheet = parseTab(text);
		// Only the first drawing fades in; redraws while typing swap in place.
		canvas.toggleAttribute("data-fresh", !canvas.firstChild);
		canvas.innerHTML = sheet.systems.length ? tabSvg(sheet, width) : "";
		message.textContent = unreadMessage(sheet, !sheet.systems.length);
	};
	const schedule = (delay: number) => {
		clearTimeout(timer);
		timer = setTimeout(draw, delay);
	};
	// The first drawing waits for the real width, so its fade is not cut short.
	const resized =
		typeof ResizeObserver === "function"
			? new ResizeObserver(() => schedule(drawn ? 50 : 0))
			: null;
	if (resized) resized.observe(canvas);
	else draw();

	return {
		dom,
		contentDOM,
		update(next) {
			if (!isTab(next) || !next.sameMarkup(current)) return false;
			current = next;
			schedule(DELAY);
			return true;
		},
		stopEvent: (event) =>
			event.target instanceof Node && panel.contains(event.target),
		ignoreMutation: (mutation) => !contentDOM.contains(mutation.target),
		destroy() {
			clearTimeout(timer);
			resized?.disconnect();
		},
	};
}
