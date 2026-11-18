import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FloatingEditor } from "@/components/ui/floating-editor";
import { resolveEmbed } from "../core/notes/canvas-embed";
import type { LinkSource } from "../editor/note-link";
import type { Host } from "../host/host";
import { NoteBlocks } from "./CanvasCard";
import { liveNoteSnapshot, SharedNoteEditor } from "./CanvasEmbed";
import type { LiveDocuments } from "./live-documents";
import type { NoteRow } from "./session";

type Request = { edit: boolean };
type Entry = {
	key: number;
	id: string;
	anchor: HTMLElement;
	request?: Request;
};
type Vault = {
	documents: LiveDocuments;
	host: Host;
	links: LinkSource;
	locked: boolean;
};
const chip = (target: EventTarget | null) =>
	target instanceof Element
		? target.closest<HTMLElement>("[data-preview-note]")
		: null;

export function FloatingNotes({
	notes,
	...vault
}: Vault & { notes: readonly NoteRow[] }) {
	const [stack, setStack] = useState<Entry[]>([]);
	useEffect(() => {
		let key = 0;
		let timer: ReturnType<typeof setTimeout>;
		const open = (anchor: HTMLElement, request?: Request) => {
			const id = anchor.dataset.previewNote;
			if (!id || !anchor.isConnected) return;
			const entry = { id, anchor, request, key: ++key };
			setStack((windows) => {
				const existing = windows.find((window) => window.anchor === anchor);
				if (existing)
					return request
						? windows.map((window) =>
								window === existing ? { ...window, request } : window,
							)
						: windows;
				return windows.length < 3 ? [...windows, entry] : windows;
			});
		};
		const listen = (event: Event) => {
			const anchor = chip(event.target);
			if (event instanceof PointerEvent && event.type.startsWith("pointer")) {
				if (
					event.pointerType === "touch" ||
					anchor === chip(event.relatedTarget)
				)
					return;
				clearTimeout(timer);
				if (anchor && event.type === "pointerover")
					timer = setTimeout(() => open(anchor), 400);
				return;
			}
			if (
				!anchor ||
				!(event instanceof MouseEvent || event instanceof KeyboardEvent)
			)
				return;
			if (event.metaKey || event.ctrlKey) return;
			if (event instanceof KeyboardEvent) {
				if (
					event.key !== "Enter" ||
					event.shiftKey ||
					event.isComposing ||
					event.repeat
				)
					return;
			} else if (!anchor.closest(".floating-editor")) return;
			event.preventDefault();
			event.stopPropagation();
			open(anchor, { edit: event instanceof KeyboardEvent && !event.altKey });
		};
		const listeners = new AbortController();
		for (const type of ["pointerover", "pointerout", "click", "keydown"])
			document.addEventListener(type, listen, {
				signal: listeners.signal,
				capture: true,
			});

		return () => {
			clearTimeout(timer);
			listeners.abort();
		};
	}, []);

	return stack.map((entry, index) => {
		const target = resolveEmbed(notes, entry.id);
		const row = target.status === "found" ? target.row : undefined;
		const onExited = () =>
			setStack((windows) =>
				windows.filter((window) => window.key !== entry.key),
			);
		return (
			<FloatingNote
				key={entry.key}
				{...vault}
				{...{ entry, row, onExited }}
				top={index === stack.length - 1}
			/>
		);
	});
}

function FloatingNote({
	entry,
	row,
	top,
	onExited,
	documents,
	host,
	links,
	locked,
}: Vault & {
	entry: Entry;
	row?: NoteRow;
	top: boolean;
	onExited: () => void;
}) {
	const { id, anchor, request } = entry;
	const origin = useRef(anchor.closest<HTMLElement>(".floating-editor, .pane"));
	const found = !!row;
	// A uniquely resolved row can still have readable blocks when it cannot be edited.
	const currentPath = useEffectEvent(() => row?.path);
	const [binding, setBinding] =
		useState<ReturnType<typeof documents.subscribePassive>>();
	const [edit, setEdit] = useState<object>();
	const [closing, setClosing] = useState(false);
	const [, redraw] = useReducer((version: number) => version + 1, 0);
	const active = binding?.ownsEditor() ? binding.current() : null;
	const open = !closing || !!active;
	const current = binding?.current();
	const doc = found && current?.draft?.header.noteId === id ? current : null;
	const canEdit =
		found && !row.readOnly && !!doc && !doc.readOnly && !locked && !closing;
	useEffect(() => {
		if (!open || !found) return;
		const path = currentPath();
		if (!path) return;
		let subscribed = true;
		const sub = documents.subscribePassive({ path }, redraw);
		const loaded = () => {
			if (subscribed) setBinding(sub);
		};
		void sub.ready.then(loaded, loaded);
		return () => {
			subscribed = false;
			sub.unsubscribe();
		};
	}, [documents, found, open]);

	useEffect(() => {
		if (request?.edit) setEdit(request);
	}, [request]);
	useEffect(() => {
		if (!edit || !binding || !canEdit) return;
		let pending = true;
		void binding.prepareEditor().then((doc) => {
			if (pending && doc?.noteId === id && doc.opened?.editable)
				binding.setEditorOwner(true, true);
		}, redraw);
		return () => {
			pending = false;
		};
	}, [binding, canEdit, edit, id]);

	const snapshot = liveNoteSnapshot(doc);

	return (
		<FloatingEditor
			anchor={anchor}
			title={snapshot?.title ?? row?.title ?? anchor.textContent ?? "Note"}
			open={open}
			top={top}
			editing={!!active}
			focusRequest={request}
			onClose={() => {
				if (binding?.ownsEditor()) binding.setEditorOwner(false);
				else binding?.unsubscribe();
				setClosing(true);
			}}
			onExited={(restore) => {
				if (restore) {
					const fallback = origin.current?.querySelector<HTMLElement>(
						`[data-preview-note="${CSS.escape(id)}"]`,
					);
					(anchor.isConnected ? anchor : (fallback ?? origin.current))?.focus();
				}
				onExited();
			}}
		>
			<div
				className="canvas-embed-body"
				onPointerDown={(event) => {
					if (canEdit && !active && event.button === 0 && !chip(event.target))
						setEdit({});
				}}
			>
				{active?.opened && binding && !locked ? (
					<SharedNoteEditor
						host={host}
						links={links}
						binding={binding}
						opened={active.opened}
						readOnly={active.readOnly}
					/>
				) : snapshot ? (
					<NoteBlocks blocks={snapshot.blocks} noteLinks />
				) : (
					<p className="canvas-embed-note">
						{found && !binding ? "Loading note…" : "This note is unavailable."}
					</p>
				)}
			</div>
			{canEdit && !active && doc && (
				<Button
					variant="ghost"
					className="self-start"
					onClick={() => setEdit({})}
				>
					Edit note
				</Button>
			)}
		</FloatingEditor>
	);
}
