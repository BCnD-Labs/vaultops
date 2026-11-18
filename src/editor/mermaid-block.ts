import type { NodeViewRendererProps } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import type { NodeView } from "@tiptap/pm/view";
import {
	describeMermaidError,
	mermaidColor,
	mermaidThemeVariables,
} from "../core/mermaid";

/** Pause after the last keystroke before the diagram is drawn again. */
const DELAY = 350;

type Mermaid = typeof import("mermaid")["default"];
let loading: Promise<Mermaid> | null = null;

/** Mermaid is large, so it loads the first time a diagram is on screen. */
function loadMermaid(): Promise<Mermaid> {
	loading ??= import("mermaid").then(
		(module) => module.default,
		(error) => {
			loading = null;
			throw error;
		},
	);
	return loading;
}

const HIDDEN_KEY = "vaultops:mermaid-source-hidden";

/** Block ids of diagrams shown without their text. UI memory, not the note. */
export function hiddenSources(next?: string[]): string[] {
	try {
		if (next)
			localStorage.setItem(HIDDEN_KEY, JSON.stringify(next.slice(-500)));
		const value: unknown = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
		if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
	} catch {
		// Not remembered; the switch still works for this session.
	}
	return next ?? [];
}

/** Mermaid settings for the current theme: strict, offline, no auto start. */
function mermaidConfig(editorDom: HTMLElement) {
	// Outside the editor: a change inside it would make ProseMirror redraw.
	const probe = document.body.appendChild(document.createElement("span"));
	const color = (token: string) => {
		probe.style.color = `var(${token})`;
		return mermaidColor(getComputedStyle(probe).color ?? "");
	};
	const fontFamily = getComputedStyle(editorDom).fontFamily ?? "";
	const themeVariables = mermaidThemeVariables(color, fontFamily);
	probe.remove();
	return {
		startOnLoad: false,
		securityLevel: "strict" as const,
		suppressErrorRendering: true,
		theme: "base" as const,
		themeVariables,
		fontFamily,
	};
}

const isMermaid = (node: PMNode) =>
	node.type.name === "codeBlock" && node.attrs.language === "mermaid";

const element = (tag: string, className: string) => {
	const made = document.createElement(tag);
	made.className = className;
	return made;
};

let renderCount = 0;

/**
 * A code block whose language is `mermaid`: its text on the left and the drawn
 * diagram on the right (stacked when narrow), with a switch to show the
 * diagram only. Any other code block gets null: the usual code block.
 */
export function mermaidNodeView({
	node,
	view,
	getPos,
}: NodeViewRendererProps): NodeView | null {
	const toDOM = node.type.spec.toDOM;
	if (!isMermaid(node) || !toDOM) return null;
	let current = node;
	const rendered = DOMSerializer.renderSpec(document, toDOM(node));
	const pre = rendered.dom as HTMLElement;
	const contentDOM = rendered.contentDOM ?? pre;

	const dom = element("div", "mermaid-block");
	const grid = dom.appendChild(element("div", "mermaid-grid"));
	const panel = element("div", "mermaid-view");
	panel.contentEditable = "false";
	grid.append(pre, panel);
	const toggle = panel.appendChild(element("button", "mermaid-toggle"));
	const canvas = panel.appendChild(element("div", "mermaid-svg"));
	const message = panel.appendChild(element("p", "mermaid-error"));
	message.setAttribute("aria-live", "polite");

	const id = () => String(current.attrs.id ?? "");
	const showSource = (hidden: boolean) => {
		dom.dataset.source = hidden ? "hidden" : "shown";
		toggle.setAttribute("aria-pressed", String(hidden));
		toggle.textContent = hidden ? "Show text" : "Diagram only";
	};
	showSource(hiddenSources().includes(id()));

	toggle.addEventListener("mousedown", (event) => event.preventDefault());
	toggle.addEventListener("click", () => {
		const hidden = dom.dataset.source !== "hidden";
		showSource(hidden);
		const rest = hiddenSources().filter((item) => item !== id());
		if (id()) hiddenSources(hidden ? [...rest, id()] : rest);
		// Hidden text can't be typed into: the caret moves past the diagram.
		const pos = getPos();
		const { selection, doc, tr } = view.state;
		if (!hidden || typeof pos !== "number") return;
		const end = pos + current.nodeSize;
		if (selection.from > pos && selection.to < end) {
			view.dispatch(tr.setSelection(Selection.near(doc.resolve(end))));
		}
	});

	let drawn = "";
	let latest = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onScreen = false;

	const draw = async () => {
		const text = current.textContent;
		const config = mermaidConfig(view.dom);
		const key = `${JSON.stringify(config)}\n${text}`;
		if (key === drawn) return;
		drawn = key;
		const ticket = ++latest;
		try {
			if (!text.trim())
				throw new Error("Type a diagram, such as: graph TD; A-->B");
			const mermaid = await loadMermaid();
			mermaid.initialize(config);
			const { svg } = await mermaid.render(`mermaid-${++renderCount}`, text);
			if (ticket !== latest) return;
			// Only the first drawing fades in; redraws while typing swap in place.
			canvas.toggleAttribute("data-fresh", !canvas.firstChild);
			canvas.innerHTML = svg;
			canvas.removeAttribute("data-stale");
			message.textContent = "";
		} catch (error) {
			if (ticket !== latest) return;
			// The last good diagram stays, dimmed, above the reason in plain words.
			canvas.toggleAttribute("data-stale", canvas.firstChild !== null);
			message.textContent = describeMermaidError(error);
		}
	};
	const schedule = (delay: number) => {
		clearTimeout(timer);
		if (onScreen) timer = setTimeout(() => void draw(), delay);
	};
	const start = () => {
		onScreen = true;
		schedule(0);
	};

	const seen =
		typeof IntersectionObserver === "function"
			? new IntersectionObserver((entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					seen?.disconnect();
					start();
				})
			: null;
	if (seen) seen.observe(dom);
	else start();

	// Theme, light/dark and colour overrides all land on the root element.
	const themed = new MutationObserver(() => schedule(100));
	themed.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["data-theme", "data-mode", "style", "class"],
	});
	const dark = window.matchMedia?.("(prefers-color-scheme: dark)");
	const onDark = () => schedule(100);
	dark?.addEventListener?.("change", onDark);

	return {
		dom,
		contentDOM,
		update(next) {
			// Other attributes (wrap, highlighted lines) are drawn by a fresh view.
			if (!isMermaid(next) || !next.sameMarkup(current)) return false;
			current = next;
			schedule(DELAY);
			return true;
		},
		stopEvent: (event) =>
			event.target instanceof Node && panel.contains(event.target),
		ignoreMutation: (mutation) => !contentDOM.contains(mutation.target),
		destroy() {
			latest++;
			clearTimeout(timer);
			seen?.disconnect();
			themed.disconnect();
			dark?.removeEventListener?.("change", onDark);
		},
	};
}
