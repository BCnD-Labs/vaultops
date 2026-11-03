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
import type { TrashedNote } from "../core/notes/trash";
import type { AutosaveState } from "../editor/autosave";
import { docToBlocks } from "../editor/doc-blocks";
import { NoteEditor } from "../editor/NoteEditor";
import type { OpenedNote } from "../editor/note-io";
import { SaveStatus } from "../editor/SaveStatus";
import { HealthScreen } from "./HealthScreen";
import { NoteChips, NoteDetails } from "./NoteMetadata";
import type { VaultView } from "./session";
import { TrashScreen } from "./TrashScreen";
import "./pane.css";

interface NotePaneProps {
	view: VaultView | null;
	screen: "note" | "trash" | "health";
	error: string | null;
	busy: boolean;
	writable: boolean;
	screenNotice: string | null;
	trash: TrashedNote[];
	confirmDelete: string | null;
	opened: OpenedNote | null;
	editorRevision: number;
	liveDoc?: JSONContent | null;
	title: string;
	props: Props | null;
	path: string | null;
	onPropsChange: (next: Props) => void;
	titleInput: Ref<HTMLInputElement>;
	saveState: AutosaveState;
	confirmTrash: boolean;
	confirmEditing: boolean;
	notice: string | null;
	onTitleChange: (title: string) => void;
	onDocChange: (doc: JSONContent) => void;
	onDropBlock?: (
		blockId: string,
		canvasId: string,
		after: string | null,
	) => Promise<void>;
	onRetry: () => void;
	onLoadDisk: () => void;
	onSaveCopy: () => void;
	onMoveToTrash: () => void;
	onConfirmTrash: (confirm: boolean) => void;
	onConfirmEditing: (confirm: boolean) => void;
	onAllowEditing: () => void;
	onNavigate: (screen: "note") => void;
	onConfirmDelete: (path: string | null) => void;
	onRestore: (path: string) => void;
	onDelete: (path: string) => void;
	onOpen: (path: string) => void;
}

export function NotePane({
	view,
	screen,
	error,
	busy,
	writable,
	screenNotice,
	trash,
	confirmDelete,
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
	onNavigate,
	onConfirmDelete,
	onRestore,
	onDelete,
	onOpen,
}: NotePaneProps) {
	const [doc, setDoc] = useState(liveDoc ?? opened?.doc);
	useEffect(() => setDoc(liveDoc ?? opened?.doc), [opened?.doc, liveDoc]);
	const editor = opened && (
		<>
			<input
				ref={titleInput}
				className="title-field"
				aria-label="Title"
				value={title}
				readOnly={!opened.editable}
				onChange={(event) => onTitleChange(event.target.value)}
			/>
			<NoteChips
				props={props}
				editable={opened.editable}
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
					writable && (
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
								<DropdownMenuItem onSelect={() => onConfirmTrash(true)}>
									Move to trash
								</DropdownMenuItem>
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
				editable={opened.editable}
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
	const canvas = opened?.note?.header.kind === "canvas";

	return (
		<main className="pane">
			{error && (
				<p role="alert" className="notice">
					Something went wrong: {error}
				</p>
			)}
			{view?.status === "none" && (
				<p className="empty-pane">
					No vault is open. Choose a folder to start.
				</p>
			)}
			{screen !== "note" && (
				<>
					<Button
						size="sm"
						variant="secondary"
						disabled={busy}
						onClick={() => onNavigate("note")}
					>
						Back to notes
					</Button>
					{screenNotice && (
						<p role="status" className="notice">
							{screenNotice}
						</p>
					)}
				</>
			)}
			{screen === "trash" && (
				<TrashScreen
					entries={trash}
					disabled={busy || !writable}
					confirming={confirmDelete}
					onConfirm={onConfirmDelete}
					onRestore={(p) => onRestore(p)}
					onDelete={(p) => onDelete(p)}
				/>
			)}
			{screen === "health" && view && (
				<HealthScreen report={view.report} onOpen={onOpen} />
			)}
			{screen === "note" && canvas && (
				<p className="empty-pane">Pick a note to edit beside the canvas.</p>
			)}
			{screen === "note" && !canvas && editor}
			{screen === "note" && !opened && view && view.status !== "none" && (
				<p className="empty-pane">Pick a note, or start a new one.</p>
			)}
		</main>
	);
}
