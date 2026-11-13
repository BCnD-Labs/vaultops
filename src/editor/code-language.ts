import { Extension } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";
import {
	addRange,
	clipLines,
	formatLines,
	isHighlighted,
	normalizeHighlight,
	parseLines,
	toggleLine,
} from "./code-highlight";

/** The languages the picker offers: [stored name, label]. "" means plain text. */
export const CODE_LANGUAGES: ReadonlyArray<readonly [string, string]> = [
	["", "Plain text"],
	["bash", "Bash"],
	["c", "C"],
	["cpp", "C++"],
	["css", "CSS"],
	["go", "Go"],
	["html", "HTML"],
	["java", "Java"],
	["javascript", "JavaScript"],
	["json", "JSON"],
	["markdown", "Markdown"],
	["python", "Python"],
	["rust", "Rust"],
	["sql", "SQL"],
	["typescript", "TypeScript"],
	["yaml", "YAML"],
];

/** Display label for a stored code block language id. */
export function languageLabel(id: string | null | undefined): string {
	const value = typeof id === "string" ? id : "";
	const match = CODE_LANGUAGES.find(([key]) => key === value);
	return match ? match[1] : value;
}

const lowlight = createLowlight(common);

/**
 * Small syntax-highlighting interface around lowlight. Only highlights when a
 * known language is chosen on the block; plain text skips auto-detection.
 */
const highlighter = {
	highlight: (language: string, value: string) =>
		lowlight.highlight(language, value),
	highlightAuto: () => ({ type: "root" as const, children: [] }),
	listLanguages: () => lowlight.listLanguages(),
	registered: (language: string) => lowlight.registered(language),
};

/**
 * A code block's `wrap` attribute: long lines wrap instead of scrolling. Left
 * out of the file when false, so untouched blocks are unchanged on disk.
 */
export function wrapOf(value: unknown): boolean {
	return value === true;
}

export const CodeBlock = CodeBlockLowlight.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			wrap: {
				default: false,
				parseHTML: (element) => element.getAttribute("data-wrap") === "true",
				renderHTML: (attributes) =>
					wrapOf(attributes.wrap) ? { "data-wrap": "true" } : {},
			},
			// The highlighted lines, such as "2,5-7" (see code-highlight.ts).
			highlight: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-highlight"),
				renderHTML: (attributes) =>
					typeof attributes.highlight === "string" && attributes.highlight
						? { "data-highlight": attributes.highlight }
						: {},
			},
		};
	},
}).configure({
	lowlight: highlighter,
	defaultLanguage: null,
});

/**
 * Click on a line number: highlight that line, or clear it; with shift, highlight
 * every line from the last one clicked in this block to this one.
 */
function markLine(view: EditorView, at: number, line: number, extend: boolean) {
	const $at = view.state.doc.resolve(at);
	const node = $at.parent;
	if (node.type.name !== "codeBlock") return;
	const blockPos = $at.before($at.depth);
	const key = String(node.attrs.id ?? blockPos);
	const count = codeLines(node.textContent).length;
	const now = clipLines(parseLines(node.attrs.highlight), count);
	const anchor = lastClicked.get(key);
	const next =
		extend && anchor !== undefined
			? addRange(now, anchor, line)
			: toggleLine(now, line);
	lastClicked.set(key, line);
	view.dispatch(
		view.state.tr.setNodeMarkup(blockPos, undefined, {
			...node.attrs,
			highlight: formatLines(next),
		}),
	);
}

/** The text of each line of a code block, in order (an empty block has one). */
export function codeLines(text: string): string[] {
	return text.split("\n");
}

/** How many digits the largest line number has: the gutter's width in `ch`. */
export function lineDigits(lineCount: number): number {
	return String(Math.max(1, lineCount)).length;
}

export const codeLanguageKey = new PluginKey("codeLanguage");

/** The Settings switch for line highlight, which the app puts on the root. */
function highlightOn(view: EditorView): boolean {
	return !view.dom.ownerDocument.documentElement.hasAttribute(
		"data-hide-code-highlight",
	);
}

/** The last line number clicked in each block, for shift-click. */
const lastClicked = new Map<string, number>();

/**
 * Language label/picker and Copy button at the top right of every code block.
 */
export const CodeLanguage = Extension.create({
	name: "codeLanguage",

	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			// Highlighted lines the code no longer has are dropped when it is edited
			// (and a stored value that does not parse is rewritten), in the same
			// undo step as the edit.
			new Plugin({
				key: new PluginKey("codeHighlightClean"),
				appendTransaction(transactions, _old, state) {
					if (!transactions.some((tr) => tr.docChanged)) return null;
					let next: Transaction | null = null;
					state.doc.descendants((node, pos) => {
						if (node.type.name !== "codeBlock") return true;
						const stored = node.attrs.highlight;
						if (stored === null || stored === undefined) return false;
						const want = normalizeHighlight(
							stored,
							codeLines(node.textContent).length,
						);
						if (want !== stored) {
							next = (next ?? state.tr).setNodeMarkup(pos, undefined, {
								...node.attrs,
								highlight: want,
							});
						}
						return false;
					});
					return next;
				},
			}),
			new Plugin({
				key: codeLanguageKey,
				props: {
					decorations(state) {
						const editable = editor.isEditable;
						const decorations: Decoration[] = [];
						state.doc.descendants((node, pos) => {
							if (node.type.name !== "codeBlock") return true;
							const lines = codeLines(node.textContent);
							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, {
									style: `--code-digits: ${lineDigits(lines.length)}`,
								}),
							);
							const wrapped = wrapOf(node.attrs.wrap);
							const lit = clipLines(
								parseLines(node.attrs.highlight),
								lines.length,
							);
							const current =
								typeof node.attrs.language === "string"
									? node.attrs.language
									: "";
							decorations.push(
								Decoration.widget(
									pos + 1,
									(view, getPos) => {
										const bar = document.createElement("div");
										bar.className = "code-block-bar";
										bar.contentEditable = "false";

										const copy = document.createElement("button");
										copy.type = "button";
										copy.className = "code-copy";
										copy.setAttribute("aria-label", "Copy code");
										copy.textContent = "Copy";
										let resetTimer: ReturnType<typeof setTimeout> | null = null;
										copy.addEventListener("click", () => {
											const at = getPos();
											if (at === undefined) return;
											const target = view.state.doc.nodeAt(at - 1);
											const text =
												target?.type.name === "codeBlock"
													? target.textContent
													: "";
											void navigator.clipboard?.writeText(text).catch(() => {});
											copy.textContent = "Copied";
											copy.dataset.copied = "true";
											if (resetTimer) clearTimeout(resetTimer);
											resetTimer = setTimeout(() => {
												copy.textContent = "Copy";
												delete copy.dataset.copied;
											}, 1500);
										});
										bar.append(copy);

										if (editable) {
											const wrap = document.createElement("button");
											wrap.type = "button";
											wrap.className = "code-wrap";
											wrap.setAttribute("aria-label", "Wrap long lines");
											wrap.setAttribute("aria-pressed", String(wrapped));
											wrap.textContent = "Wrap";
											wrap.addEventListener("click", () => {
												const at = getPos();
												if (at === undefined) return;
												const target = view.state.doc.nodeAt(at - 1);
												if (!target || target.type.name !== "codeBlock") return;
												view.dispatch(
													view.state.tr.setNodeMarkup(at - 1, undefined, {
														...target.attrs,
														wrap: !wrapOf(target.attrs.wrap),
													}),
												);
											});
											bar.append(wrap);
										}

										if (editable) {
											const select = document.createElement("select");
											select.className = "code-language";
											select.setAttribute("aria-label", "Code language");
											const known = CODE_LANGUAGES.some(
												([id]) => id === current,
											);
											const options = known
												? CODE_LANGUAGES
												: [...CODE_LANGUAGES, [current, current] as const];
											for (const [id, label] of options) {
												const option = document.createElement("option");
												option.value = id;
												option.textContent = label;
												select.append(option);
											}
											select.value = current;
											select.addEventListener("change", () => {
												const at = getPos();
												if (at === undefined) return;
												const target = view.state.doc.nodeAt(at - 1);
												if (!target || target.type.name !== "codeBlock") return;
												view.dispatch(
													view.state.tr.setNodeMarkup(at - 1, undefined, {
														...target.attrs,
														language: select.value || null,
													}),
												);
											});
											bar.append(select);
										} else {
											const label = document.createElement("span");
											label.className = "code-language";
											label.setAttribute("aria-label", "Code language");
											label.textContent = languageLabel(current);
											bar.append(label);
										}

										return bar;
									},
									{
										side: -1,
										key: `code-language-${pos}-${current}-${editable}-${wrapped}`,
										stopEvent: () => true,
										ignoreSelection: true,
									},
								),
							);
							// One number at the start of each real line. It is a separate
							// element, so it is never part of the code that is copied.
							let at = pos + 1;
							lines.forEach((line, index) => {
								const on = isHighlighted(lit, index + 1);
								if (on && line.length > 0) {
									decorations.push(
										Decoration.inline(at, at + line.length, {
											class: "code-hl",
										}),
									);
								}
								decorations.push(
									Decoration.widget(
										at,
										(view, getPos) => {
											const number = document.createElement("span");
											number.className = "code-ln";
											number.contentEditable = "false";
											number.setAttribute("aria-hidden", "true");
											number.dataset.line = String(index + 1);
											if (on) number.dataset.hl = "true";
											if (editable) {
												number.dataset.edit = "true";
												// Keep the cursor where it is: this is a button, not text.
												number.addEventListener("mousedown", (event) =>
													event.preventDefault(),
												);
												number.addEventListener("click", (event) => {
													const here = getPos();
													if (here === undefined || !highlightOn(view)) return;
													markLine(view, here, index + 1, event.shiftKey);
												});
											}
											return number;
										},
										{
											side: -1,
											key: `code-ln-${index}-${on}-${editable}`,
											stopEvent: () => true,
											ignoreSelection: true,
										},
									),
								);
								at += line.length + 1;
							});
							return false;
						});
						return DecorationSet.create(state.doc, decorations);
					},
				},
			}),
		];
	},
});
