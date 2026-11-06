import type { JSONContent } from "@tiptap/core";
import { Ellipsis } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Props } from "../core/notes/properties";
import type { AutosaveState } from "../editor/autosave";
import { docToBlocks } from "../editor/doc-blocks";
import { type DropSlot, NoteEditor } from "../editor/NoteEditor";
import type { OpenedNote } from "../editor/note-io";
import { SaveStatus } from "../editor/SaveStatus";
import { NoteDetails } from "./NoteMetadata";
import { PropertiesBlock } from "./PropertiesBlock";
import type { NoteSession } from "./useNoteSession";
import "./pane.css";

export interface NoteViewProps {
	opened: OpenedNote;
	editorRevision: number;
	liveDoc?: JSONContent | null;
	title: string;
	props: Props | null;
	path: string | null;
	onPropsChange: (next: Props) => void;
	titleInput?: Ref<HTMLInputElement>;
	saveState: AutosaveState;
	confirmTrash: boolean;
	confirmEditing: boolean;
	notice: string | null;
	writable: boolean;
	/** Reading view: the note is shown but cannot be typed in. */
	reading?: boolean;
	/** Reading view and edit view swap from the note's menu. */
	onToggleReading?: () => void;
	busy: boolean;
	onTitleChange: (title: string) => void;
	onDocChange: (doc: JSONContent) => void;
	onDropBlock?: (
		blockId: string,
		canvasId: string,
		slot: DropSlot,
	) => Promise<void>;
	onRetry: () => void;
	onLoadDisk: () => void;
	onSaveCopy: () => void;
	onMoveToTrash: () => void;
	onConfirmTrash: (confirm: boolean) => void;
	onConfirmEditing: (confirm: boolean) => void;
	onAllowEditing: () => void;
}

/**
 * One open note as the person sees it: title, properties, save status, notice,
 * the editor and the details line. Everything comes in as props, so the same
 * view serves the app's single note today and a note in either pane later.
 */
export function NoteView({
	opened,
	editorRevision,
	liveDoc,
	title,
	props,
	path,
	onPropsChange,
	titleInput,
	saveState,
	confirmTrash,
	confirmEditing,
	notice,
	writable,
	reading = false,
	onToggleReading,
	busy,
	onTitleChange,
	onDocChange,
	onDropBlock,
	onRetry,
	onLoadDisk,
	onSaveCopy,
	onMoveToTrash,
	onConfirmTrash,
	onConfirmEditing,
	onAllowEditing,
}: NoteViewProps) {
	// The block count follows what is typed, not only what was loaded.
	const [doc, setDoc] = useState(liveDoc ?? opened.doc);
	useEffect(() => setDoc(liveDoc ?? opened.doc), [opened.doc, liveDoc]);
	return (
		<>
			<input
				ref={titleInput}
				className="title-field"
				aria-label="Title"
				value={title}
				readOnly={!opened.editable || reading}
				onChange={(event) => onTitleChange(event.target.value)}
			/>
			<PropertiesBlock
				props={props}
				editable={opened.editable && !reading}
				onChange={onPropsChange}
			/>
			<div className="status-line">
				{opened.editable && saveState.kind !== "saved" && (
					<SaveStatus
						state={saveState}
						onRetry={onRetry}
						onLoadDisk={onLoadDisk}
						onSaveCopy={onSaveCopy}
					/>
				)}{" "}
				{confirmTrash ? (
					<span>
						Move this note to the trash?{" "}
						<button type="button" onClick={onMoveToTrash}>
							Move to trash
						</button>{" "}
						<button type="button" onClick={() => onConfirmTrash(false)}>
							Cancel
						</button>
					</span>
				) : (
					(writable || onToggleReading) && (
						<DropdownMenu>
							<Tooltip>
								<TooltipTrigger asChild>
									<DropdownMenuTrigger asChild>
										<Button
											variant="ghost"
											size="icon"
											className="note-menu"
											aria-label="Note actions"
											disabled={busy}
										>
											<Ellipsis aria-hidden="true" />
										</Button>
									</DropdownMenuTrigger>
								</TooltipTrigger>
								<TooltipContent>Note actions</TooltipContent>
							</Tooltip>
							<DropdownMenuContent align="end">
								{onToggleReading && (
									<DropdownMenuItem onSelect={onToggleReading}>
										{reading
											? "Switch to editing view"
											: "Switch to reading view"}
									</DropdownMenuItem>
								)}
								<DropdownMenuItem
									disabled={!path}
									onSelect={() => {
										try {
											void navigator.clipboard?.writeText(path ?? "");
										} catch {
											/* Clipboard is optional. */
										}
									}}
								>
									Copy file path
								</DropdownMenuItem>
								{writable && (
									<DropdownMenuItem onSelect={() => onConfirmTrash(true)}>
										Move to trash
									</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					)
				)}
			</div>
			{notice && (
				<p role="status" className="notice">
					{notice}
				</p>
			)}
			{opened.canAllowEditing &&
				(confirmEditing ? (
					<div className="tree-confirm">
						<p>
							Some lines of this note could not be read. If you edit it, those
							lines will be lost when it saves.
						</p>
						<Button size="sm" onClick={onAllowEditing}>
							Allow editing
						</Button>{" "}
						<Button
							size="sm"
							variant="secondary"
							onClick={() => onConfirmEditing(false)}
						>
							Keep read-only
						</Button>
					</div>
				) : (
					<Button
						size="sm"
						variant="secondary"
						onClick={() => onConfirmEditing(true)}
					>
						Allow editing
					</Button>
				))}
			<NoteEditor
				key={`${opened.path}:${editorRevision}`}
				doc={liveDoc ?? opened.doc}
				noteId={opened.note?.header.noteId}
				editable={opened.editable && !reading}
				onChange={(next) => {
					setDoc(next);
					onDocChange(next);
				}}
				onDropBlock={onDropBlock}
			/>
			<NoteDetails
				path={path ?? opened.path}
				count={
					opened.editable && doc
						? docToBlocks(doc).length
						: (opened.note?.blocks.length ?? null)
				}
				status={
					opened.editable
						? saveState.kind === "saved"
							? "Saved"
							: saveState.kind === "saving"
								? "Saving…"
								: saveState.kind === "failed"
									? "Not saved"
									: "Unsaved changes"
						: "Read-only"
				}
			/>
		</>
	);
}

export interface SessionNoteViewProps {
	session: NoteSession;
	writable: boolean;
	reading?: boolean;
	onToggleReading?: () => void;
	busy?: boolean;
	titleInput?: Ref<HTMLInputElement>;
	onLoadDisk: () => void;
	onSaveCopy: () => void;
	onMoveToTrash: () => void;
	onDropBlock?: NoteViewProps["onDropBlock"];
}

/**
 * A pane's note: `NoteView` driven by a note session. The confirm-trash and
 * confirm-editing questions belong to the pane, so each pane asks its own, and
 * loading another note starts with nothing to confirm.
 */
export function SessionNoteView(props: SessionNoteViewProps) {
	const { opened, editorRevision } = props.session;
	return (
		<main className="pane">
			{opened && <PaneNote key={editorRevision} {...props} opened={opened} />}
		</main>
	);
}

function PaneNote({
	session,
	opened,
	writable,
	reading = false,
	onToggleReading,
	busy = false,
	titleInput,
	onLoadDisk,
	onSaveCopy,
	onMoveToTrash,
	onDropBlock,
}: SessionNoteViewProps & { opened: OpenedNote }) {
	const [confirmTrash, setConfirmTrash] = useState(false);
	const [confirmEditing, setConfirmEditing] = useState(false);
	return (
		<NoteView
			opened={opened}
			editorRevision={session.editorRevision}
			liveDoc={session.docRef.current}
			title={session.title}
			props={session.props}
			path={session.livePath}
			onPropsChange={session.editProps}
			titleInput={titleInput}
			saveState={session.saveState}
			confirmTrash={confirmTrash}
			confirmEditing={confirmEditing}
			notice={session.notice}
			writable={writable}
			reading={reading}
			onToggleReading={onToggleReading}
			busy={busy}
			onTitleChange={session.editTitle}
			onDocChange={session.editDoc}
			onDropBlock={onDropBlock}
			onRetry={session.retry}
			onLoadDisk={onLoadDisk}
			onSaveCopy={onSaveCopy}
			onMoveToTrash={() => {
				setConfirmTrash(false);
				onMoveToTrash();
			}}
			onConfirmTrash={setConfirmTrash}
			onConfirmEditing={setConfirmEditing}
			onAllowEditing={() => {
				session.unlock();
				setConfirmEditing(false);
			}}
		/>
	);
}
