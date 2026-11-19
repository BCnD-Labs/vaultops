import type { Editor, JSONContent } from "@tiptap/core";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	NOTE_FORMAT,
	NOTE_FORMAT_VERSION,
	type Note,
} from "../core/note-format";
import {
	headerProps,
	type PropertyValue,
	type Props,
	withProps,
} from "../core/notes/properties";
import {
	type FolderTemplateRule,
	loadTemplateRules,
	saveTemplateRules,
} from "../core/notes/template-rules";
import {
	createTemplateFolder,
	duplicateTemplate,
	extractPrompts,
	fillTemplate,
	listTemplates,
	removeTemplateEntry,
	renameTemplateEntry,
	saveTemplate,
	type TemplateEntry,
	type TemplateList,
	updateTemplate,
} from "../core/notes/templates";
import { nameKey } from "../core/vault-path/vault-path";
import { blocksToDoc, checkBlocks, docToBlocks } from "../editor/doc-blocks";
import { NoteEditor } from "../editor/NoteEditor";
import type { Host } from "../host/host";
import { notify } from "../ui/notify";
import { FolderPickerDialog, VAULT_ROOT } from "./FolderPickerDialog";
import { ManagerDialog, messageOf, useDiscardGuard } from "./ManagerDialog";
import { PropertiesBlock } from "./PropertiesBlock";
import { Control } from "./PropertiesPanel";
import type { NoteRow } from "./session";
import { templateFormats, templateWeekStart } from "./settings";
import { ConfirmDialog, NameDialog } from "./TemplateDialogs";
import { featureEnabled } from "./useFeature";
import { useRovingList } from "./useRovingList";
import "./templates.css";

/** Radix Select items cannot have an empty value, so "no context note" gets a stand-in. */
const UNTITLED = "__untitled__";

const placeholders = [
	"title",
	"date",
	"date:next Monday",
	"time",
	"prompt:Name|text",
	"cursor",
	"selection",
];

type Answers = Record<string, PropertyValue>;

type Prompt =
	| { kind: "new-template"; folder: string }
	| { kind: "new-folder"; folder: string }
	| { kind: "rename"; path: string; initial: string; isFolder: boolean };

/** One row of the visible tree, in screen order (see `flat`). */
type TreeRow = {
	key: string;
	folder: boolean;
	open: boolean;
	parentKey: string | null;
	level: number;
};

const parentOf = (label: string) =>
	label.includes("/") ? label.slice(0, label.lastIndexOf("/")) : "";

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
	folders = [],
	writable,
	open,
	focusRequest,
	onClose,
	onNewNoteFromTemplate,
}: {
	host: Host;
	notes: NoteRow[];
	folders?: readonly string[];
	writable: boolean;
	open: boolean;
	/** A new object brings the open window to the front and focuses it. */
	focusRequest?: object;
	onClose: () => void;
	/** Makes a note from the saved template; the button is hidden without it. */
	onNewNoteFromTemplate?: (entry: TemplateEntry) => void;
}) {
	const [list, setList] = useState<TemplateList | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
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
	const [previewSource, setPreviewSource] = useState<{
		note: Note;
		title: string;
		now: Date;
	} | null>(null);
	const [answers, setAnswers] = useState<Answers>({});
	const [titlePattern, setTitlePattern] = useState<string>();
	const [properties, setProperties] = useState<Props>();
	const inserted = useRef(false);
	const editorRoot = useRef<HTMLDivElement>(null);
	const [rules, setRules] = useState<FolderTemplateRule[]>([]);
	const [ruleError, setRuleError] = useState<string | null>(null);
	const busyRules = useRef(false);
	const [ruleBusy, setRuleBusy] = useState(false);
	const [picker, setPicker] = useState<string | null>(null);
	const [previewKey, setPreviewKey] = useState(0);
	const [contextQuery, setContextQuery] = useState("");
	const [contextPath, setContextPath] = useState("");
	const [menuFor, setMenuFor] = useState<string | null>(null);

	const refreshRules = useCallback(async () => {
		try {
			setRules(await loadTemplateRules(host));
			setRuleError(null);
		} catch (error) {
			setRuleError(messageOf(error));
		}
	}, [host]);

	const changeRules = async (folder: string, next?: FolderTemplateRule) => {
		if (busyRules.current || !writable) return;
		busyRules.current = true;
		setRuleBusy(true);
		try {
			const current = await loadTemplateRules(host);
			const updated = current.filter(
				(rule) => nameKey(rule.folder) !== nameKey(folder),
			);
			if (next) updated.push(next);
			await saveTemplateRules(host, updated);
			setRules(updated);
			setRuleError(null);
		} catch (error) {
			setRuleError(messageOf(error));
		} finally {
			busyRules.current = false;
			setRuleBusy(false);
		}
	};

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
		setProblem(null);
		setPreviewSource(null);
		void refresh();
		void refreshRules();
	}, [open, refresh, refreshRules]);

	const entry = list?.templates.find((t) => t.path === selected) ?? null;
	const readable = entry?.note ? checkBlocks(entry.note.blocks) : null;
	const editable = writable && readable?.ok === true;
	// The editor reads this once when it starts; it is restarted by its `key`.
	const startDoc =
		entry?.note && readable?.ok ? blocksToDoc(entry.note.blocks) : null;

	// Anything that would drop typed edits asks first.
	const { guard: guardDiscard, dialog: discardDialog } = useDiscardGuard(
		dirty,
		{
			title: "Discard your changes?",
			description:
				"This template has edits you haven't saved. Going on will drop them.",
			confirmLabel: "Discard changes",
			cancelLabel: "Keep editing",
			onDiscard: () => setDirty(false),
		},
	);

	const guard = (run: () => void) => {
		if (!saving && !busyRules.current) guardDiscard(run);
	};

	const choose = (path: string | null, folderLabel?: string) => {
		setSelected(path);
		if (folderLabel !== undefined) setFolder(folderLabel);
		setDirty(false);
		setPreviewSource(null);
		setTitlePattern(undefined);
		setProperties(undefined);
		setProblem(null);
		edited.current = null;
		setRevision((n) => n + 1);
	};

	const reload = async (select?: string | null) => {
		const [next] = await Promise.all([refresh(), refreshRules()]);
		if (!next) return;
		const wanted = select === undefined ? selected : select;
		const found = next.templates.find((t) => t.path === wanted);
		choose(found ? found.path : null, found?.folder ?? folder);
	};

	const draftHeader = (header: Note["header"]) => {
		const next =
			properties === undefined ? { ...header } : withProps(header, properties);
		if (titlePattern !== undefined) {
			if (titlePattern.trim()) next.titleTemplate = titlePattern;
			else delete next.titleTemplate;
		}
		return next;
	};
	const save = async () => {
		if (!entry || !editable || !dirty || saving) return;
		setSaving(true);
		try {
			await updateTemplate(
				host,
				entry.path,
				edited.current ? docToBlocks(edited.current) : undefined,
				draftHeader,
			);
			await refresh();
			setTitlePattern(undefined);
			setProperties(undefined);
			setDirty(false);
			setProblem(null);
			edited.current = null;
			notify(`Saved "${entry.label}".`);
		} catch (error) {
			setProblem(messageOf(error));
		} finally {
			setSaving(false);
		}
	};

	const preview = useMemo(
		() =>
			previewSource &&
			fillTemplate(previewSource.note, previewSource.title, {
				now: previewSource.now,
				formats: templateFormats(),
				weekStartsOn: templateWeekStart(),
				answers,
			}),
		[previewSource, answers],
	);
	const showPreview = () => {
		if (!entry?.note) return;
		const source = {
			note: {
				header: draftHeader(entry.note.header),
				blocks: edited.current
					? docToBlocks(edited.current)
					: entry.note.blocks,
			},
			title: notes.find((n) => n.path === contextPath)?.title ?? "Untitled",
			now: new Date(),
		};
		setAnswers({});
		setPreviewSource(source);
		setPreviewKey((n) => n + 1);
	};
	const samplePrompts = previewSource
		? extractPrompts(previewSource.note, previewSource.now, templateWeekStart())
		: [];

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
				tree.requestFocus(result.path);
			} else {
				const result = await renameTemplateEntry(host, prompt.path, name);
				setPrompt(null);
				notify(result.notice ?? `Renamed "${prompt.initial}" to "${name}".`);
				const moved =
					selected === prompt.path
						? result.path
						: selected?.startsWith(`${prompt.path}/`)
							? result.path + selected.slice(prompt.path.length)
							: selected;
				await reload(moved);
				tree.requestFocus(result.path);
			}
		} catch (error) {
			setPromptError(messageOf(error));
		}
	};

	const duplicate = async (path: string) => {
		try {
			const label = list?.templates.find((t) => t.path === path)?.label;
			const result = await duplicateTemplate(host, path);
			await reload(result.path);
			tree.requestFocus(result.path);
			notify(label ? `Duplicated "${label}".` : "Duplicated the template.");
		} catch (error) {
			setProblem(messageOf(error));
		}
	};

	const remove = async () => {
		if (!removing) return;
		const { path, name, isFolder } = removing;
		setRemoving(null);
		try {
			// The row to land on: the nearest one that is not going away.
			const at = flat.findIndex((r) => r.key === path);
			const stays = (r: TreeRow) =>
				r.key !== path && !r.key.startsWith(`${path}/`);
			const near =
				flat.slice(at + 1).find(stays) ??
				flat.slice(0, Math.max(at, 0)).reverse().find(stays);
			await removeTemplateEntry(host, path);
			const gone = selected === path || selected?.startsWith(`${path}/`);
			await reload(gone ? null : selected);
			tree.requestFocus(near?.key ?? null);
			notify(
				isFolder
					? `Moved the folder "${name}" and its templates to the recovery folder.`
					: `Moved "${name}" to the recovery folder.`,
			);
		} catch (error) {
			setProblem(messageOf(error));
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
		key: string,
		label: string,
		items: { text: string; run: () => void }[],
	) => (
		<DropdownMenu
			open={menuFor === key}
			onOpenChange={(next) => setMenuFor(next ? key : null)}
		>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="text-muted-foreground"
					aria-label={`Actions for ${label}`}
					tabIndex={-1}
				>
					<Ellipsis aria-hidden="true" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				onCloseAutoFocus={(event) => {
					// Back to the row, which is the Tab stop, not to the "…" button.
					event.preventDefault();
					if (!document.activeElement?.matches("[data-roving]"))
						tree.focusKey(key);
				}}
			>
				{items.map((item) => (
					<DropdownMenuItem key={item.text} onSelect={item.run}>
						{item.text}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	// The folders and templates shown at one level, after the search.
	const levelOf = (parent: string) => ({
		folders: (list?.folders ?? []).filter(
			(f) => parentOf(f.label) === parent && visibleFolder(f.label),
		),
		templates: (list?.templates ?? []).filter(
			(t) => t.folder === parent && visibleTemplate(t),
		),
	});
	const isOpenFolder = (label: string) => q !== "" || !collapsed.has(label);

	// Every row on screen in order, for the arrow keys.
	const flat: TreeRow[] = [];
	const walk = (parent: string, parentKey: string | null, level: number) => {
		const { folders, templates } = levelOf(parent);
		for (const f of folders) {
			const open = isOpenFolder(f.label);
			flat.push({ key: f.path, folder: true, open, parentKey, level });
			if (open) walk(f.label, f.path, level + 1);
		}
		for (const t of templates)
			flat.push({ key: t.path, folder: false, open: false, parentKey, level });
	};
	walk("", null, 1);

	const toggleFolder = (label: string) =>
		setCollapsed((c) => {
			const next = new Set(c);
			if (next.has(label)) next.delete(label);
			else next.add(label);
			return next;
		});
	const tree = useRovingList(
		flat.map((r) => r.key),
		selected ??
			(folder === ""
				? null
				: (list?.folders.find((f) => f.label === folder)?.path ?? null)),
		(event, key) => {
			const row = flat.find((r) => r.key === key);
			if (!row) return false;
			if (
				event.key === "ContextMenu" ||
				(event.key === "F10" && event.shiftKey)
			) {
				if (!writable) return false;
				setMenuFor(key);
				return true;
			}
			if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
				return false;
			const label = list?.folders.find((f) => f.path === key)?.label ?? "";
			if (event.key === "ArrowRight" && row.folder) {
				if (!row.open) toggleFolder(label);
				else {
					const child = flat.find((r) => r.parentKey === key);
					if (child) tree.focusKey(child.key);
				}
				return true;
			}
			if (event.key === "ArrowLeft") {
				if (row.folder && row.open && q === "") toggleFolder(label);
				else if (row.parentKey !== null) tree.focusKey(row.parentKey);
				else return false;
				return true;
			}
			return false;
		},
	);

	const renderLevel = (parent: string, level: number): React.ReactNode => {
		const { folders, templates } = levelOf(parent);
		return (
			<>
				{folders.map((f) => {
					const isOpen = isOpenFolder(f.label);
					return (
						<li key={f.path} role="none">
							<div
								className="tpl-row"
								data-selected={folder === f.label && selected === null}
							>
								<button
									type="button"
									role="treeitem"
									className="tpl-row-main"
									aria-expanded={isOpen}
									aria-level={level}
									aria-selected={folder === f.label && selected === null}
									{...tree.itemProps(f.path)}
									onClick={() => {
										setFolder(f.label);
										toggleFolder(f.label);
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
									rowMenu(f.path, f.name, [
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
							{isOpen && (
								// biome-ignore lint/a11y/useSemanticElements: a tree's nested list is role=group; a fieldset is a form control
								<ul role="group">{renderLevel(f.label, level + 1)}</ul>
							)}
						</li>
					);
				})}
				{templates.map((t) => (
					<li key={t.path} role="none">
						<div className="tpl-row" data-selected={selected === t.path}>
							<button
								type="button"
								role="treeitem"
								className="tpl-row-main tpl-template"
								aria-level={level}
								aria-selected={selected === t.path}
								{...tree.itemProps(t.path)}
								onClick={() => guard(() => choose(t.path, t.folder))}
							>
								<FileText aria-hidden="true" />
								<span>{t.name}</span>
							</button>
							{writable &&
								rowMenu(t.path, t.name, [
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
	const assigned = rules.filter((rule) => rule.template === entry?.path);
	const empty =
		list !== null && list.templates.length === 0 && list.folders.length === 0;

	return (
		<>
			<ManagerDialog
				open={open}
				onRequestClose={() => guard(onClose)}
				kind="template-manager"
				focusRequest={focusRequest}
				className="tpl-manager"
				title="Template manager"
				description="Add, edit, organise and preview templates for new content."
			>
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
				{problem && (
					<p role="alert" className="tpl-error">
						{problem}
					</p>
				)}
				<div className="tpl-body">
					<div className="tpl-side">
						<Input
							aria-label="Search templates by name or path"
							placeholder="Search templates"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<nav
							aria-label="Templates"
							className="tpl-nav"
							ref={tree.rootRef}
							onKeyDown={tree.onKeyDown}
						>
							{/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: an ARIA tree */}
							<ul className="tpl-tree" role="tree" aria-label="Templates">
								{renderLevel("", 1)}
							</ul>
						</nav>
						<details className="tpl-disclosure">
							<summary>
								Folder rules{assigned.length === 0 && " · None"}
							</summary>
							{ruleError && (
								<p role="alert" className="tpl-error">
									{ruleError}
								</p>
							)}
							{assigned.map((rule) => {
								const label = rule.folder || VAULT_ROOT;
								return (
									<div className="tpl-rule" key={rule.folder}>
										<span>
											{label} → {entry?.label}
										</span>
										<label
											htmlFor={`tpl-inherit-${encodeURIComponent(rule.folder)}`}
											className="flex items-center gap-2"
										>
											<Checkbox
												id={`tpl-inherit-${encodeURIComponent(rule.folder)}`}
												checked={rule.subfolders}
												disabled={!editable || ruleBusy}
												onCheckedChange={(checked) =>
													void changeRules(rule.folder, {
														...rule,
														subfolders: checked === true,
													})
												}
											/>
											Include subfolders
										</label>
										<Button
											size="sm"
											variant="ghost"
											disabled={!editable || ruleBusy}
											aria-label={`Remove rule for ${label}`}
											onClick={() => void changeRules(rule.folder)}
										>
											Remove
										</Button>
									</div>
								);
							})}
							<Button
								size="sm"
								variant="outline"
								disabled={!entry || !editable || ruleBusy}
								onClick={() => entry && setPicker(entry.path)}
							>
								<Plus aria-hidden="true" /> Add rule
							</Button>
						</details>
						{list === null && !loadError && (
							<p className="manager-empty">Loading templates…</p>
						)}
						{empty && (
							<p className="manager-empty">
								No templates yet. Add one with New template, or save a note as a
								template from its menu.
							</p>
						)}
					</div>
					<div className="tpl-main">
						{!entry && (
							<div className="tpl-empty">
								<p className="manager-empty">Choose a template to edit it.</p>
							</div>
						)}
						{entry && (
							<>
								<div className="tpl-path">
									<strong>{entry.label}</strong>
								</div>
								{startDoc && (
									<details key={entry.path} className="tpl-disclosure">
										<summary>Title pattern &amp; properties</summary>
										<Input
											aria-label="Title pattern"
											placeholder="Title pattern"
											disabled={!editable || saving}
											value={
												titlePattern ??
												(typeof entry.note?.header.titleTemplate === "string"
													? entry.note.header.titleTemplate
													: "")
											}
											onChange={(event) => {
												setTitlePattern(event.target.value);
												setDirty(true);
											}}
										/>
										<PropertiesBlock
											props={properties ?? headerProps(entry.note?.header)}
											editable={editable && !saving}
											onChange={(next) => {
												setProperties(next);
												setDirty(true);
											}}
										/>
									</details>
								)}
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
									<div className="tpl-editor" ref={editorRoot}>
										<NoteEditor
											key={`${entry.path}:${revision}`}
											doc={startDoc}
											editable={editable && !saving}
											onChange={(doc) => {
												edited.current = doc;
												setDirty(true);
												setProblem(null);
											}}
											featureOn={featureEnabled}
										/>
									</div>
								)}
								<div className="tpl-actions">
									{editable && (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button size="sm" variant="outline" disabled={saving}>
													Insert {"{{…}}"}
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												onCloseAutoFocus={(event) => {
													if (inserted.current) {
														event.preventDefault();
														inserted.current = false;
													}
												}}
											>
												{placeholders.map((token) => (
													<DropdownMenuItem
														key={token}
														onSelect={() => {
															const dom = editorRoot.current?.querySelector<
																HTMLElement & { editor?: Editor }
															>(".ProseMirror");
															inserted.current =
																dom?.editor
																	?.chain()
																	.focus()
																	.insertContent(`{{${token}}}`)
																	.run() ?? false;
														}}
													>{`{{${token}}}`}</DropdownMenuItem>
												))}
											</DropdownMenuContent>
										</DropdownMenu>
									)}
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
									{onNewNoteFromTemplate && (
										<Button
											size="sm"
											variant="outline"
											disabled={!writable || !entry.note || !readable?.ok}
											onClick={() => guard(() => onNewNoteFromTemplate(entry))}
										>
											New note from this template
										</Button>
									)}
									{dirty && <span className="tpl-note">Unsaved changes</span>}
								</div>
								<div className="tpl-context props !m-0">
									<strong>Preview context</strong>
									<p className="tpl-note">
										Choose a document to supply the preview title.
									</p>
									<div className="tpl-context-pick">
										<Input
											aria-label="Search context documents"
											placeholder="Search context documents"
											value={contextQuery}
											onChange={(event) => setContextQuery(event.target.value)}
										/>
										<Select
											value={contextPath === "" ? UNTITLED : contextPath}
											onValueChange={(v) =>
												setContextPath(v === UNTITLED ? "" : v)
											}
										>
											<SelectTrigger aria-label="Preview context">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={UNTITLED}>Untitled</SelectItem>
												{contextMatches.map((n) => (
													<SelectItem key={n.path} value={n.path}>
														{n.title}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									{samplePrompts.map(
										({ label, type, options, default: initial }) => (
											<div className="prop-row" key={label}>
												<span className="prop-name">{label}</span>
												<Control
													item={{
														known: true,
														name: label,
														type,
														options,
														value: Object.hasOwn(answers, label)
															? (answers[label] ?? null)
															: initial,
													}}
													editable
													onValue={(value) => {
														setAnswers((current) => ({
															...current,
															[label]: value,
														}));
														setPreviewKey((n) => n + 1);
													}}
												/>
											</div>
										),
									)}
								</div>
								{preview && (
									<section
										className="tpl-preview"
										aria-label="Template preview"
									>
										<strong>{preview.title}</strong>
										<NoteEditor
											key={previewKey}
											doc={blocksToDoc(preview.blocks)}
											editable={false}
											onChange={() => {}}
										/>
									</section>
								)}
							</>
						)}
					</div>
				</div>
			</ManagerDialog>
			{picker && (
				<FolderPickerDialog
					open={open}
					folders={folders}
					current="."
					title="Assign template to folder"
					onOpenChange={(next) => !next && setPicker(null)}
					onPick={(folder) => {
						setPicker(null);
						void changeRules(folder, {
							folder,
							template: picker,
							subfolders: true,
						});
					}}
				/>
			)}
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
			{discardDialog}
		</>
	);
}
