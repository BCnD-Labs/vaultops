import type { JSONContent } from "@tiptap/core";
import {
	ChevronDown,
	ChevronRight,
	Ellipsis,
	FileText,
	Folder,
	FolderPlus,
	Plus,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NOTE_FORMAT, NOTE_FORMAT_VERSION } from "../core/note-format";
import {
	blocksFromTemplate,
	createTemplateFolder,
	duplicateTemplate,
	listTemplates,
	removeTemplateEntry,
	renameTemplateEntry,
	saveTemplate,
	type TemplateEntry,
	type TemplateList,
	updateTemplate,
} from "../core/notes/templates";
import { blocksToDoc, checkBlocks, docToBlocks } from "../editor/doc-blocks";
import { NoteEditor } from "../editor/NoteEditor";
import type { Host } from "../host/host";
import type { NoteRow } from "./session";
import { templateFormats } from "./settings";
import { ConfirmDialog, NameDialog } from "./TemplateDialogs";
import "./templates.css";

type Prompt =
	| { kind: "new-template"; folder: string }
	| { kind: "new-folder"; folder: string }
	| { kind: "rename"; path: string; initial: string; isFolder: boolean };

const parentOf = (label: string) =>
	label.includes("/") ? label.slice(0, label.lastIndexOf("/")) : "";
const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

/**
 * The template manager: every template in a folder tree with a search box, an
 * editor for the chosen one with Save, and a preview that fills the template in
 * for a document you pick. Nothing is lost silently: unsaved edits ask before
 * they are dropped, a removed template goes to the recovery folder, and a name
 * already in use is refused.
 */
export function TemplateManager({
	host,
	notes,
	writable,
	open,
	onClose,
}: {
	host: Host;
	notes: NoteRow[];
	writable: boolean;
	open: boolean;
	onClose: () => void;
}) {
	const [list, setList] = useState<TemplateList | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [folder, setFolder] = useState("");
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const [query, setQuery] = useState("");
	const [revision, setRevision] = useState(0);
	const [dirty, setDirty] = useState(false);
	const [saving, setSaving] = useState(false);
	const edited = useRef<JSONContent | null>(null);
	const [prompt, setPrompt] = useState<Prompt | null>(null);
	const [promptError, setPromptError] = useState<string | null>(null);
	const [removing, setRemoving] = useState<{
		path: string;
		name: string;
		isFolder: boolean;
	} | null>(null);
	const [discard, setDiscard] = useState<(() => void) | null>(null);
	const [preview, setPreview] = useState<JSONContent | null>(null);
	const [previewKey, setPreviewKey] = useState(0);
	const [contextQuery, setContextQuery] = useState("");
	const [contextPath, setContextPath] = useState("");

	const refresh = useCallback(async (): Promise<TemplateList | null> => {
		try {
			const next = await listTemplates(host);
			setList(next);
			setLoadError(null);
			return next;
		} catch (error) {
			setLoadError(`The templates could not be read: ${messageOf(error)}`);
			return null;
		}
	}, [host]);

	useEffect(() => {
		if (!open) return;
		setMessage(null);
		setPreview(null);
		void refresh();
	}, [open, refresh]);

	const entry = list?.templates.find((t) => t.path === selected) ?? null;
	const readable = entry?.note ? checkBlocks(entry.note.blocks) : null;
	const editable = writable && readable?.ok === true;
	// The editor reads this once when it starts; it is restarted by its `key`.
	const startDoc =
		entry?.note && readable?.ok ? blocksToDoc(entry.note.blocks) : null;

	// Anything that would drop typed edits asks first.
	const guard = (action: () => void) => {
		if (dirty) setDiscard(() => action);
		else action();
	};

	const choose = (path: string | null, folderLabel?: string) => {
		setSelected(path);
		if (folderLabel !== undefined) setFolder(folderLabel);
		setDirty(false);
		setPreview(null);
		setMessage(null);
		edited.current = null;
		setRevision((n) => n + 1);
	};

	const reload = async (select?: string | null) => {
		const next = await refresh();
		if (!next) return;
		const wanted = select === undefined ? selected : select;
		const found = next.templates.find((t) => t.path === wanted);
		choose(found ? found.path : null, found?.folder ?? folder);
	};

	const save = async () => {
		if (!entry || !edited.current) return;
		setSaving(true);
		try {
			await updateTemplate(host, entry.path, docToBlocks(edited.current));
			setDirty(false);
			setMessage("Saved.");
			await refresh();
		} catch (error) {
			setMessage(messageOf(error));
		} finally {
			setSaving(false);
		}
	};

	const showPreview = () => {
		if (!entry?.note) return;
		const blocks = docToBlocks(
			edited.current ?? blocksToDoc(entry.note.blocks),
		);
		const context = notes.find((n) => n.path === contextPath);
		const filled = blocksFromTemplate(
			{ header: entry.note.header, blocks },
			context?.title ?? "Untitled",
			new Date(),
			templateFormats(),
		);
		setPreview(blocksToDoc(filled));
		setPreviewKey((n) => n + 1);
	};

	const submitPrompt = async (name: string) => {
		if (!prompt) return;
		setPromptError(null);
		try {
			if (prompt.kind === "new-folder") {
				await createTemplateFolder(host, prompt.folder, name);
				setCollapsed((c) => {
					const next = new Set(c);
					next.delete(prompt.folder);
					return next;
				});
				setPrompt(null);
				await reload();
			} else if (prompt.kind === "new-template") {
				const result = await saveTemplate(
					host,
					name,
					{
						header: {
							format: NOTE_FORMAT,
							v: NOTE_FORMAT_VERSION,
							noteId: crypto.randomUUID(),
							title: name,
						},
						blocks: [
							{ id: crypto.randomUUID(), type: "paragraph", parent: null },
						],
					},
					{ folder: prompt.folder },
				);
				if (!result.ok) {
					setPromptError(result.message);
					return;
				}
				setPrompt(null);
				await reload(result.path);
			} else {
				const result = await renameTemplateEntry(host, prompt.path, name);
				setPrompt(null);
				const moved =
					selected === prompt.path
						? result.path
						: selected?.startsWith(`${prompt.path}/`)
							? result.path + selected.slice(prompt.path.length)
							: selected;
				await reload(moved);
			}
		} catch (error) {
			setPromptError(messageOf(error));
		}
	};

	const duplicate = async (path: string) => {
		try {
			const result = await duplicateTemplate(host, path);
			await reload(result.path);
		} catch (error) {
			setMessage(messageOf(error));
		}
	};

	const remove = async () => {
		if (!removing) return;
		const { path } = removing;
		setRemoving(null);
		try {
			await removeTemplateEntry(host, path);
			const gone = selected === path || selected?.startsWith(`${path}/`);
			await reload(gone ? null : selected);
		} catch (error) {
			setMessage(messageOf(error));
		}
	};

	const q = query.trim().toLowerCase();
	const matches = (label: string) =>
		q === "" || label.toLowerCase().includes(q);
	const visibleTemplate = (t: TemplateEntry) => matches(t.label);
	const visibleFolder = (label: string) =>
		matches(label) ||
		(list?.templates ?? []).some(
			(t) => t.label.startsWith(`${label}/`) && visibleTemplate(t),
		);

	const rowMenu = (
		label: string,
		items: { text: string; run: () => void }[],
	) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="tpl-more"
					aria-label={`Actions for ${label}`}
				>
					<Ellipsis aria-hidden="true" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{items.map((item) => (
					<DropdownMenuItem key={item.text} onSelect={item.run}>
						{item.text}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	const renderLevel = (parent: string): React.ReactNode => {
		const folders = (list?.folders ?? []).filter(
			(f) => parentOf(f.label) === parent && visibleFolder(f.label),
		);
		const templates = (list?.templates ?? []).filter(
			(t) => t.folder === parent && visibleTemplate(t),
		);
		return (
			<>
				{folders.map((f) => {
					const isOpen = q !== "" || !collapsed.has(f.label);
					return (
						<li key={f.path}>
							<div
								className="tpl-row"
								data-selected={folder === f.label && selected === null}
							>
								<button
									type="button"
									className="tpl-row-main"
									aria-expanded={isOpen}
									onClick={() => {
										setFolder(f.label);
										setCollapsed((c) => {
											const next = new Set(c);
											if (next.has(f.label)) next.delete(f.label);
											else next.add(f.label);
											return next;
										});
									}}
								>
									{isOpen ? (
										<ChevronDown aria-hidden="true" />
									) : (
										<ChevronRight aria-hidden="true" />
									)}
									<Folder aria-hidden="true" />
									<span>{f.name}</span>
								</button>
								{writable &&
									rowMenu(f.name, [
										{
											text: "New template here",
											run: () =>
												guard(() =>
													setPrompt({ kind: "new-template", folder: f.label }),
												),
										},
										{
											text: "New folder here",
											run: () =>
												guard(() =>
													setPrompt({ kind: "new-folder", folder: f.label }),
												),
										},
										{
											text: "Rename",
											run: () =>
												guard(() =>
													setPrompt({
														kind: "rename",
														path: f.path,
														initial: f.name,
														isFolder: true,
													}),
												),
										},
										{
											text: "Delete",
											run: () =>
												guard(() =>
													setRemoving({
														path: f.path,
														name: f.name,
														isFolder: true,
													}),
												),
										},
									])}
							</div>
							{isOpen && <ul>{renderLevel(f.label)}</ul>}
						</li>
					);
				})}
				{templates.map((t) => (
					<li key={t.path}>
						<div className="tpl-row" data-selected={selected === t.path}>
							<button
								type="button"
								className="tpl-row-main tpl-template"
								aria-current={selected === t.path}
								onClick={() => guard(() => choose(t.path, t.folder))}
							>
								<FileText aria-hidden="true" />
								<span>{t.name}</span>
							</button>
							{writable &&
								rowMenu(t.name, [
									{
										text: "Rename",
										run: () =>
											guard(() =>
												setPrompt({
													kind: "rename",
													path: t.path,
													initial: t.name,
													isFolder: false,
												}),
											),
									},
									{
										text: "Duplicate",
										run: () => guard(() => void duplicate(t.path)),
									},
									{
										text: "Delete",
										run: () =>
											guard(() =>
												setRemoving({
													path: t.path,
													name: t.name,
													isFolder: false,
												}),
											),
									},
								])}
						</div>
					</li>
				))}
			</>
		);
	};

	const contextMatches = notes
		.filter(
			(n) =>
				contextQuery.trim() === "" ||
				n.title.toLowerCase().includes(contextQuery.trim().toLowerCase()),
		)
		.slice(0, 200);
	const empty =
		list !== null && list.templates.length === 0 && list.folders.length === 0;

	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next) guard(onClose);
				}}
			>
				<DialogContent
					className="tpl-manager"
					lightOverlay
					aria-describedby="tpl-manager-about"
				>
					<DialogTitle>Template manager</DialogTitle>
					<DialogDescription id="tpl-manager-about" className="sr-only">
						Add, edit, organise and preview templates for new content.
					</DialogDescription>
					<div className="tpl-toolbar">
						<Button
							size="sm"
							variant="outline"
							disabled={!writable}
							onClick={() =>
								guard(() => setPrompt({ kind: "new-template", folder }))
							}
						>
							<Plus aria-hidden="true" /> New template
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={!writable}
							onClick={() =>
								guard(() => setPrompt({ kind: "new-folder", folder }))
							}
						>
							<FolderPlus aria-hidden="true" /> New folder
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => guard(() => void reload())}
						>
							<RefreshCw aria-hidden="true" /> Refresh
						</Button>
					</div>
					{!writable && (
						<p className="tpl-note">
							This vault is read-only, so templates can only be viewed.
						</p>
					)}
					{loadError && (
						<p role="alert" className="tpl-error">
							{loadError}
						</p>
					)}
					<div className="tpl-body">
						<div className="tpl-side">
							<Input
								aria-label="Search templates by name or path"
								placeholder="Search templates by name or path"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
							<nav aria-label="Templates" className="tpl-nav">
								<ul className="tpl-tree">{renderLevel("")}</ul>
							</nav>
							{empty && (
								<p className="tpl-note">
									No templates yet. Add one with New template, or save a note as
									a template from its menu.
								</p>
							)}
						</div>
						<div className="tpl-main">
							{!entry && (
								<div className="tpl-empty">
									<p className="tpl-note">Choose a template to edit it.</p>
								</div>
							)}
							{entry && (
								<>
									<div className="tpl-path">
										<strong>{entry.label}</strong>
									</div>
									{entry.problem && (
										<p role="alert" className="tpl-error">
											{entry.problem}
										</p>
									)}
									{entry.note && readable && !readable.ok && (
										<p role="alert" className="tpl-error">
											This template has {readable.reason}, which this version
											can't edit, so it is shown read-only unchanged.
										</p>
									)}
									{startDoc && (
										<div className="tpl-editor">
											<NoteEditor
												key={`${entry.path}:${revision}`}
												doc={startDoc}
												editable={editable}
												onChange={(doc) => {
													edited.current = doc;
													setDirty(true);
													setMessage(null);
												}}
											/>
										</div>
									)}
									<div className="tpl-actions">
										{writable && (
											<Button
												size="sm"
												disabled={!dirty || saving || !editable}
												onClick={() => void save()}
											>
												Save
											</Button>
										)}
										<Button
											size="sm"
											variant="outline"
											disabled={!entry.note}
											onClick={showPreview}
										>
											Preview template
										</Button>
										{dirty && <span className="tpl-note">Unsaved changes</span>}
										{message && (
											<span role="status" className="tpl-note">
												{message}
											</span>
										)}
									</div>
									<div className="tpl-context">
										<strong>Preview context</strong>
										<p className="tpl-note">
											Fills in {"{{title}}"}, {"{{date}}"} and {"{{time}}"}{" "}
											using the document you choose, without changing it.
										</p>
										<div className="tpl-context-pick">
											<Input
												aria-label="Search context documents"
												placeholder="Search context documents"
												value={contextQuery}
												onChange={(event) =>
													setContextQuery(event.target.value)
												}
											/>
											<select
												aria-label="Preview context"
												value={contextPath}
												onChange={(event) => setContextPath(event.target.value)}
											>
												<option value="">Untitled</option>
												{contextMatches.map((n) => (
													<option key={n.path} value={n.path}>
														{n.title}
													</option>
												))}
											</select>
										</div>
									</div>
									{preview && (
										<section
											className="tpl-preview"
											aria-label="Template preview"
										>
											<NoteEditor
												key={previewKey}
												doc={preview}
												editable={false}
												onChange={() => {}}
											/>
										</section>
									)}
								</>
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<NameDialog
				open={prompt !== null}
				title={
					prompt?.kind === "new-folder"
						? "New folder"
						: prompt?.kind === "rename"
							? prompt.isFolder
								? "Rename folder"
								: "Rename template"
							: "New template"
				}
				label={prompt?.kind === "new-folder" ? "Folder name" : "Template name"}
				description={
					prompt && prompt.kind !== "rename" && prompt.folder !== ""
						? `It will go in ${prompt.folder}.`
						: undefined
				}
				initial={prompt?.kind === "rename" ? prompt.initial : ""}
				confirmLabel={prompt?.kind === "rename" ? "Rename" : "Create"}
				error={promptError}
				onSubmit={(name) => void submitPrompt(name)}
				onCancel={() => {
					setPrompt(null);
					setPromptError(null);
				}}
			/>
			<ConfirmDialog
				open={removing !== null}
				title={
					removing?.isFolder ? "Delete this folder?" : "Delete this template?"
				}
				description={`"${removing?.name ?? ""}"${removing?.isFolder ? " and everything in it" : ""} will be taken out of the template list. The files are kept in the vault's hidden recovery folder, not erased.`}
				confirmLabel="Delete"
				onConfirm={() => void remove()}
				onCancel={() => setRemoving(null)}
			/>
			<ConfirmDialog
				open={discard !== null}
				title="Discard your changes?"
				description="This template has edits you haven't saved. Going on will drop them."
				confirmLabel="Discard changes"
				cancelLabel="Keep editing"
				onConfirm={() => {
					const action = discard;
					setDiscard(null);
					setDirty(false);
					action?.();
				}}
				onCancel={() => setDiscard(null)}
			/>
		</>
	);
}
