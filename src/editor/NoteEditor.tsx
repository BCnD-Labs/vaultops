import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createExtensions } from "./extensions";
import { ensureUniqueIds } from "./ids";
import "./editor.css";

export interface NoteEditorProps {
	/** The note's document. Read once when the editor mounts: give the component a new `key` to show another note. */
	doc: JSONContent;
	/** Called with the whole document after every edit. */
	onChange: (doc: JSONContent) => void;
	editable?: boolean;
}

/** The Tiptap editor for one note. It does no file access. */
export function NoteEditor({
	doc,
	onChange,
	editable = true,
}: NoteEditorProps) {
	const latest = useRef(onChange);
	latest.current = onChange;

	const editor = useEditor({
		extensions: createExtensions(),
		content: ensureUniqueIds(doc),
		editable,
		onUpdate: ({ editor }) => latest.current(editor.getJSON()),
	});

	useEffect(() => {
		editor?.setEditable(editable);
	}, [editor, editable]);

	return <EditorContent editor={editor} className="note-editor" />;
}
