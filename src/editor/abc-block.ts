import type { NodeViewRendererProps } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import { hiddenSources, setDrawingWidth } from "./mermaid-block";

const DELAY = 350;
const TAB_KEY = "vaultops:abc-guitar-tab";

type Abcjs = typeof import("abcjs");
let loading: Promise<Abcjs> | null = null;

/** abcjs loads the first time a sheet music block is on screen (never synth). */
function loadAbcjs(): Promise<Abcjs> {
	loading ??= import("abcjs").then(
		(m) => ("default" in m && m.default ? m.default : m) as Abcjs,
		(error) => {
			loading = null;
			throw error;
		},
	);
	return loading;
}

/** Block ids with guitar tablature switched on. UI memory, not the note. */
export function guitarTabs(next?: string[]): string[] {
	try {
		if (next) localStorage.setItem(TAB_KEY, JSON.stringify(next.slice(-500)));
		const value: unknown = JSON.parse(localStorage.getItem(TAB_KEY) ?? "[]");
		if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
	} catch {
		// Session only if storage fails.
	}
	return next ?? [];
}

/** Plain words for an abcjs parser warning or render error; never HTML or a stack. */
export function describeAbcWarning(raw: string): string {
	const m = /^Music Line:(\d+):\d+:\s*(.+?)(?::\s\s.*)?$/.exec(raw);
	const what = (m?.[2] ?? raw)
		.replace(/<[^>]+>/g, "")
		.replace(/&(?:lt|gt|amp);/g, "")
		.trim()
		.slice(0, 120);
	if (!what) return "The music text can't be read";
	return m
		? `Line ${m[1]}: ${what.charAt(0).toLowerCase() + what.slice(1)}`
		: what.charAt(0).toUpperCase() + what.slice(1);
}

const isAbc = (node: PMNode) =>
	node.type.name === "codeBlock" && node.attrs.language === "abc";

const element = (tag: string, className: string) =>
	Object.assign(document.createElement(tag), { className });

/** A code block with language `abc`: source on the left, sheet music on the right. */
export function abcNodeView({
	node,
	view,
	getPos,
}: NodeViewRendererProps): NodeView | null {
	const toDOM = node.type.spec.toDOM;
	if (!isAbc(node) || !toDOM) return null;
	let current = node;
	const rendered = DOMSerializer.renderSpec(document, toDOM(node));
	const pre = rendered.dom as HTMLElement;
	const contentDOM = rendered.contentDOM ?? pre;

	const dom = element("div", "mermaid-block abc-block");
	const grid = dom.appendChild(element("div", "mermaid-grid"));
	const panel = element("div", "mermaid-view");
	panel.contentEditable = "false";
	grid.append(pre, panel);
	const bar = panel.appendChild(element("div", "mermaid-controls"));
	const tabToggle = bar.appendChild(
		element("button", "mermaid-toggle abc-tab-toggle"),
	);
	const toggle = bar.appendChild(element("button", "mermaid-toggle"));
	const canvas = panel.appendChild(element("div", "mermaid-svg abc-svg"));
	const message = panel.appendChild(element("p", "mermaid-error"));
	message.setAttribute("aria-live", "polite");

	const id = () => String(current.attrs.id ?? "");
	const remember = (store: (next?: string[]) => string[], on: boolean) => {
		const rest = store().filter((item) => item !== id());
		if (id()) store(on ? [...rest, id()] : rest);
	};
	let showTab = guitarTabs().includes(id());
	const updateTabButton = () => {
		tabToggle.textContent = showTab ? "Hide guitar tab" : "Show guitar tab";
		tabToggle.setAttribute("aria-pressed", String(showTab));
	};
	updateTabButton();

	const showSource = (hidden: boolean) => {
		dom.dataset.source = hidden ? "hidden" : "shown";
		toggle.setAttribute("aria-pressed", String(hidden));
		toggle.textContent = hidden ? "Show text" : "Music only";
	};
	showSource(hiddenSources().includes(id()));

	for (const btn of [tabToggle, toggle]) {
		btn.setAttribute("type", "button");
		btn.addEventListener("mousedown", (e) => e.preventDefault());
	}
	tabToggle.addEventListener("click", () => {
		showTab = !showTab;
		updateTabButton();
		remember(guitarTabs, showTab);
		schedule(0);
	});
	toggle.addEventListener("click", () => {
		const hidden = dom.dataset.source !== "hidden";
		showSource(hidden);
		remember(hiddenSources, hidden);
		const pos = getPos();
		const { selection, doc, tr } = view.state;
		if (!hidden || typeof pos !== "number") return;
		const end = pos + current.nodeSize;
		if (selection.from > pos && selection.to < end)
			view.dispatch(tr.setSelection(Selection.near(doc.resolve(end))));
	});

	let drawn = "";
	let latest = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onScreen = false;

	const draw = async () => {
		const text = current.textContent;
		const tab = showTab;
		const key = `${tab}\n${text}`;
		if (key === drawn) return;
		drawn = key;
		const ticket = ++latest;
		try {
			if (!text.trim())
				throw new Error("Type ABC music, such as: X:1\\nK:C\\nC D E F |");
			const abcjs = await loadAbcjs();
			if (ticket !== latest) return;
			const scratch = document.createElement("div");
			const [tune] = abcjs.renderAbc(scratch, text, {
				responsive: "resize",
				foregroundColor: "currentColor",
				...(tab ? { tablature: [{ instrument: "guitar" }] } : {}),
			});
			if (tune?.warnings?.[0]) throw new Error(tune.warnings[0]);
			const drawings = scratch.querySelectorAll<SVGSVGElement>(":scope > svg");
			if (!drawings.length) throw new Error("");
			// The card does its own scaling, without abcjs's absolute SVG overlay.
			for (const drawing of drawings) {
				setDrawingWidth(drawing);
				drawing.style.removeProperty("position");
			}
			canvas.toggleAttribute("data-fresh", !canvas.firstChild);
			canvas.innerHTML = scratch.innerHTML;
			canvas.removeAttribute("data-stale");
			message.textContent = "";
		} catch (error) {
			if (ticket !== latest) return;
			canvas.toggleAttribute("data-stale", canvas.firstChild !== null);
			message.textContent = describeAbcWarning(
				error instanceof Error ? error.message : "",
			);
		}
	};
	const schedule = (delay: number) => {
		clearTimeout(timer);
		if (onScreen) timer = setTimeout(() => void draw(), delay);
	};
	const seen =
		typeof IntersectionObserver === "function"
			? new IntersectionObserver((entries) => {
					if (!entries.some((e) => e.isIntersecting)) return;
					seen?.disconnect();
					onScreen = true;
					schedule(0);
				})
			: null;
	if (seen) seen.observe(dom);
	else {
		onScreen = true;
		schedule(0);
	}

	return {
		dom,
		contentDOM,
		update(next) {
			if (!isAbc(next) || !next.sameMarkup(current)) return false;
			current = next;
			schedule(DELAY);
			return true;
		},
		stopEvent: (e) => e.target instanceof Node && panel.contains(e.target),
		ignoreMutation: (m) => !contentDOM.contains(m.target),
		destroy() {
			latest++;
			clearTimeout(timer);
			seen?.disconnect();
		},
	};
}
