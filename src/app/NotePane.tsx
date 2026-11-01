import type { JSONContent } from "@tiptap/core";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import type { Props as NoteProps } from "../core/notes/properties";
import type { TrashedNote } from "../core/notes/trash";
import type { AutosaveState } from "../editor/autosave";
import { NoteEditor } from "../editor/NoteEditor";
import type { OpenedNote } from "../editor/note-io";
import { SaveStatus } from "../editor/SaveStatus";
import { HealthScreen } from "./HealthScreen";
import { PropertiesPanel } from "./PropertiesPanel";
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
	title: string;
	titleInput: Ref<HTMLInputElement>;
	saveState: AutosaveState;
	confirmTrash: boolean;
	confirmEditing: boolean;
	notice: string | null;
	props: NoteProps | null;
	onTitleChange: (title: string) => void;
	onDocChange: (doc: JSONContent) => void;
	onRetry: () => void;
	onLoadDisk: () => void;
	onSaveCopy: () => void;
	onMoveToTrash: () => void;
	onConfirmTrash: (confirm: boolean) => void;
	onConfirmEditing: (confirm: boolean) => void;
	onAllowEditing: () => void;
	onPropsChange: (props: NoteProps) => void;
	onOpenTag: (tag: string) => void;
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
	title,
	titleInput,
	saveState,
	confirmTrash,
	confirmEditing,
	notice,
	props,
	onTitleChange,
	onDocChange,
	onRetry,
	onLoadDisk,
	onSaveCopy,
	onMoveToTrash,
	onConfirmTrash,
	onConfirmEditing,
	onAllowEditing,
	onPropsChange,
	onOpenTag,
	onNavigate,
	onConfirmDelete,
	onRestore,
	onDelete,
	onOpen,
}: NotePaneProps) {
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
			<div className="status-line">
				{opened.editable && (
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
						<button
							type="button"
							className="link-button"
							disabled={busy}
							onClick={() => onConfirmTrash(true)}
						>
							Move to trash
						</button>
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
			<PropertiesPanel
				props={props}
				editable={opened.editable}
				onChange={onPropsChange}
				onOpenTag={onOpenTag}
			/>
			<NoteEditor
				key={opened.path}
				doc={opened.doc}
				editable={opened.editable}
				onChange={onDocChange}
			/>
		</>
	);

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
			{screen === "note" && editor}
			{screen === "note" && !opened && view && view.status !== "none" && (
				<p className="empty-pane">Pick a note, or start a new one.</p>
			)}
		</main>
	);
}
