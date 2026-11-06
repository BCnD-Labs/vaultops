import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

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

export const codeLanguageKey = new PluginKey("codeLanguage");

/**
 * A small language picker at the top right of every code block while the note
 * can be edited. It only sets the block's `language` attribute (the stored name,
 * left out of the file for plain text); there is no syntax colouring yet.
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
						if (!editor.isEditable) return null;
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
										const select = document.createElement("select");
										select.className = "code-language";
										select.contentEditable = "false";
										select.setAttribute("aria-label", "Code language");
										const known = CODE_LANGUAGES.some(([id]) => id === current);
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
										return select;
									},
									{
										side: -1,
										key: `code-language-${pos}-${current}`,
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
