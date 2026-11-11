import type { JSONContent } from "@tiptap/core";
import { BookOpen, Ellipsis, Pencil } from "lucide-react";
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
import {
	blocksFromTemplate,
	type TemplateEntry,
} from "../core/notes/templates";
import type { AutosaveState } from "../editor/autosave";
import { blocksToDoc, checkBlocks, docToBlocks } from "../editor/doc-blocks";
import {
	type DropSlot,
	NoteEditor,
	type TemplateRequest,
} from "../editor/NoteEditor";
import type { OpenedNote } from "../editor/note-io";
import type { LinkSource } from "../editor/note-link";
import { SaveStatus } from "../editor/SaveStatus";
import type { Host } from "../host/host";
import { NoteDetails } from "./NoteMetadata";
import { PropertiesBlock } from "./PropertiesBlock";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { templateFormats } from "./settings";
import { TemplatePicker } from "./TemplatePicker";
import type { NoteSession } from "./useNoteSession";
import "./pane.css";

/** What a note needs to offer templates: where they live, and how to open the manager. */
export interface TemplatesApi {
	host: Host;
	onManage: () => void;
}

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
	/** Opens the folder picker for this note ("Move to…" in the menu). */
	onMoveTo?: () => void;
	onConfirmEditing: (confirm: boolean) => void;
	onAllowEditing: () => void;
	/** Turns on the slash menu's Template item and "Save as template". */
	templates?: TemplatesApi;
	/** Turns on `[[` and `@` links. */
	links?: LinkSource;
	/** The note cannot be typed in for a moment (a block is being moved). */
	locked?: boolean;
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
	onMoveTo,
	onConfirmEditing,
	onAllowEditing,
	templates,
	links,
	locked = false,
}: NoteViewProps) {
	// The block count follows what is typed, not only what was loaded.
	const [doc, setDoc] = useState(liveDoc ?? opened.doc);
	useEffect(() => setDoc(liveDoc ?? opened.doc), [opened.doc, liveDoc]);
	const [picker, setPicker] = useState<TemplateRequest | null>(null);
	const [saveAsOpen, setSaveAsOpen] = useState(false);
	const [templateNotice, setTemplateNotice] = useState<string | null>(null);
	const canTemplate = !!templates && opened.editable && !reading;
	const insertTemplate = (entry: TemplateEntry, request: TemplateRequest) => {
		if (!entry.note) return;
		const blocks = blocksFromTemplate(
			entry.note,
			title,
			new Date(),
			templateFormats(),
		);
		const understood = checkBlocks(blocks);
		if (!understood.ok) {
			request.focus();
			setTemplateNotice(
				`"${entry.name}" has ${understood.reason}, which this version can't insert.`,
			);
			return;
		}
		setTemplateNotice(null);
		request.insert(blocksToDoc(blocks).content ?? []);
	};
	return (
		<>
			<input
				ref={titleInput}
				className="title-field"
				aria-label="Title"
				value={title}
				readOnly={!opened.editable || reading}
				onChange={(event) => onTitleChange(event.target.value)}
				onKeyDown={(event) => {
					// Enter ends the title and starts the note, like every writing app.
					if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
					event.preventDefault();
					event.currentTarget
						.closest("main")
						?.querySelector<HTMLElement>(
							'.note-editor [contenteditable="true"]',
						)
						?.focus();
				}}
			/>
			<PropertiesBlock
				props={props}
				editable={opened.editable && !reading && !locked}
				onChange={onPropsChange}
			/>
			<div className="status-line">
				{onToggleReading && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="note-reading"
								aria-label={
									reading ? "Switch to editing view" : "Switch to reading view"
								}
								onClick={onToggleReading}
							>
								{reading ? (
									<Pencil aria-hidden="true" />
								) : (
									<BookOpen aria-hidden="true" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{reading ? "Switch to editing view" : "Switch to reading view"}
						</TooltipContent>
					</Tooltip>
				)}
				{opened.editable && saveState.kind !== "saved" && (
					<SaveStatus
						state={saveState}
						onRetry={onRetry}
						onLoadDisk={onLoadDisk}
						onSaveCopy={onSaveCopy}
					/>
				)}{" "}
				{(writable || onToggleReading) && (
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
							{templates && writable && opened.editable && (
								<DropdownMenuItem onSelect={() => setSaveAsOpen(true)}>
									Save as template…
								</DropdownMenuItem>
							)}
							{writable && onMoveTo && opened.editable && (
								<DropdownMenuItem onSelect={onMoveTo}>
									Move to…
								</DropdownMenuItem>
							)}
							{writable && (
								<DropdownMenuItem onSelect={onMoveToTrash}>
									Move to trash
								</DropdownMenuItem>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
			{notice && (
				<p role="status" className="notice">
					{notice}
				</p>
			)}
			{templateNotice && (
				<p role="status" className="notice">
					{templateNotice}
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
				editable={opened.editable && !reading && !locked}
				onChange={(next) => {
					setDoc(next);
					onDocChange(next);
				}}
				onDropBlock={onDropBlock}
				onChooseTemplate={canTemplate ? setPicker : undefined}
				links={links}
			/>
			{picker && templates && (
				<TemplatePicker
					host={templates.host}
					anchor={picker.anchor}
					onPick={(entry) => {
						setPicker(null);
						insertTemplate(entry, picker);
					}}
					onManage={() => {
						setPicker(null);
						templates.onManage();
					}}
					onClose={() => {
						setPicker(null);
						picker.focus();
					}}
				/>
			)}
			{templates && (
				<SaveTemplateDialog
					open={saveAsOpen}
					host={templates.host}
					defaultName={title}
					note={() =>
						opened.note
							? {
									header: opened.note.header,
									blocks: docToBlocks(doc ?? opened.doc),
								}
							: null
					}
					onSaved={(name) =>
						setTemplateNotice(`Saved as the template "${name}".`)
					}
					onClose={() => setSaveAsOpen(false)}
				/>
			)}
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
	onMoveTo?: () => void;
	onDropBlock?: NoteViewProps["onDropBlock"];
	templates?: TemplatesApi;
	links?: LinkSource;
	locked?: boolean;
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
	onMoveTo,
	onDropBlock,
	templates,
	links,
	locked = false,
}: SessionNoteViewProps & { opened: OpenedNote }) {
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
			confirmEditing={confirmEditing}
			notice={session.notice}
			writable={writable}
			reading={reading}
			onToggleReading={onToggleReading}
			busy={busy}
			onTitleChange={session.editTitle}
			onDocChange={session.editDoc}
			onDropBlock={onDropBlock}
			templates={templates}
			links={links}
			locked={locked}
			onRetry={session.retry}
			onLoadDisk={onLoadDisk}
			onSaveCopy={onSaveCopy}
			onMoveToTrash={onMoveToTrash}
			onMoveTo={onMoveTo}
			onConfirmEditing={setConfirmEditing}
			onAllowEditing={() => {
				session.unlock();
				setConfirmEditing(false);
			}}
		/>
	);
}
