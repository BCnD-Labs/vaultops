import { Extension } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { common, createLowlight } from "lowlight";

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

export const CodeBlock = CodeBlockLowlight.configure({
	lowlight: highlighter,
	defaultLanguage: null,
});

export const codeLanguageKey = new PluginKey("codeLanguage");

/**
 * Language label/picker and Copy button at the top right of every code block.
 */
export const CodeLanguage = Extension.create({
	name: "codeLanguage",

	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				key: codeLanguageKey,
				props: {
					decorations(state) {
						const editable = editor.isEditable;
						const decorations: Decoration[] = [];
						state.doc.descendants((node, pos) => {
							if (node.type.name !== "codeBlock") return true;
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
										key: `code-language-${pos}-${current}-${editable}`,
										stopEvent: () => true,
										ignoreSelection: true,
									},
								),
							);
							return false;
						});
						return DecorationSet.create(state.doc, decorations);
					},
				},
			}),
		];
	},
});
