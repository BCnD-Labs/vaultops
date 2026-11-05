import type { JSONContent } from "@tiptap/core";
import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";
import type { Props } from "../core/notes/properties";
import type { TrashedNote } from "../core/notes/trash";
import type { AutosaveState } from "../editor/autosave";
import type { OpenedNote } from "../editor/note-io";
import { HealthScreen } from "./HealthScreen";
import { NoteView } from "./NoteView";
import { SettingsScreen } from "./SettingsScreen";
import type { VaultView } from "./session";
import { TrashScreen } from "./TrashScreen";
import type { UpdateHost } from "./UpdateSection";
import "./pane.css";

interface NotePaneProps {
	view: VaultView | null;
	screen: "note" | "trash" | "health" | "settings";
	error: string | null;
	busy: boolean;
	writable: boolean;
	screenNotice: string | null;
	/** STOPGAP(update-script): what the Settings update button talks to. */
	updateHost: UpdateHost;
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
	/** Shown instead of the plain "pick a note" line when no note is open. */
	blank?: ReactNode;
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
	updateHost,
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
	blank,
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
	const editor = opened && (
		<NoteView
			opened={opened}
			editorRevision={editorRevision}
			liveDoc={liveDoc}
			title={title}
			props={props}
			path={path}
			onPropsChange={onPropsChange}
			titleInput={titleInput}
			saveState={saveState}
			confirmTrash={confirmTrash}
			confirmEditing={confirmEditing}
			notice={notice}
			writable={writable}
			busy={busy}
			onTitleChange={onTitleChange}
			onDocChange={onDocChange}
			onDropBlock={onDropBlock}
			onRetry={onRetry}
			onLoadDisk={onLoadDisk}
			onSaveCopy={onSaveCopy}
			onMoveToTrash={onMoveToTrash}
			onConfirmTrash={onConfirmTrash}
			onConfirmEditing={onConfirmEditing}
			onAllowEditing={onAllowEditing}
		/>
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
			{screen === "settings" && <SettingsScreen host={updateHost} />}
			{screen === "note" && canvas && (
				<p className="empty-pane">Pick a note to edit beside the canvas.</p>
			)}
			{screen === "note" && !canvas && editor}
			{screen === "note" &&
				!opened &&
				view &&
				view.status !== "none" &&
				(blank ?? (
					<p className="empty-pane">Pick a note, or start a new one.</p>
				))}
		</main>
	);
}
