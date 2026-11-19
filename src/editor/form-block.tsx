import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	type Answers,
	applyAnswer,
	type FormConfig,
	type FormField,
	fieldView,
	MAX_FORM_FIELDS,
	normalizeForm,
} from "../core/notes/forms";
import {
	PROPERTY_TYPES,
	type PropertyType,
	type PropertyValue,
	type Props,
	readProps,
} from "../core/notes/properties";
import { useEditable } from "./math-block";
import "./form-block.css";

/** What a form block needs from the open note; the editor itself saves nothing. */
export interface FormSource {
	/** The note's properties right now; null when the file keeps them in a form we can't edit. */
	props(): Props | null;
	/** Whether the open note can be edited (fill mode needs it). */
	editable(): boolean;
	/** Save new properties through the note's own session, so nothing is overwritten. */
	setProps(next: Props): void;
	/** Called whenever `props` or `editable` changed. */
	subscribe(listener: () => void): () => void;
	/** Create mode: the templates to choose from. */
	templates(): Promise<{ label: string }[]>;
	/** Create mode: the vault folders to choose from. */
	folders(): string[];
	canCreate(): boolean;
	/** Make the note; resolves to a plain-words problem, or null when it worked. */
	create(request: {
		config: FormConfig;
		answers: Answers;
	}): Promise<string | null>;
}

interface FormOptions {
	source: () => FormSource | null;
}

const NONE = "__none__";
const TYPE_NAMES: Record<PropertyType, string> = {
	text: "Text",
	number: "Number",
	date: "Date",
	checkbox: "Checkbox",
	list: "List",
	select: "Select",
};

const formOptions = (editor: Editor): FormOptions | undefined =>
	editor.extensionManager.extensions.find((e) => e.name === "formBlock")
		?.options;

const showNumber = (n: number | null) => (n === null ? "" : String(n));

/** A number field keeps what is typed ("1." on the way to "1.5") and reports only real numbers. */
function NumberField(props: {
	label: string;
	value: number | null;
	disabled: boolean;
	onChange: (value: number | null) => void;
}) {
	const [draft, setDraft] = useState(showNumber(props.value));
	useEffect(
		() =>
			setDraft((was) =>
				(was === "" ? null : Number(was)) === props.value
					? was
					: showNumber(props.value),
			),
		[props.value],
	);
	return (
		<Input
			type="number"
			aria-label={props.label}
			value={draft}
			disabled={props.disabled}
			onChange={(e) => {
				setDraft(e.target.value);
				const n = e.target.value === "" ? null : Number(e.target.value);
				if (n === null || Number.isFinite(n)) props.onChange(n);
			}}
		/>
	);
}

/** Text that is applied when the field is left or Enter is pressed (lists and free selects). */
function CommitField(props: {
	label: string;
	value: string;
	placeholder: string;
	disabled: boolean;
	onCommit: (text: string) => void;
}) {
	const [draft, setDraft] = useState(props.value);
	useEffect(() => setDraft(props.value), [props.value]);
	const commit = () => {
		if (draft !== props.value) props.onCommit(draft);
	};
	return (
		<Input
			aria-label={props.label}
			placeholder={props.placeholder}
			value={draft}
			disabled={props.disabled}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commit();
				}
			}}
		/>
	);
}

/** One control for a field, whichever type; used by both modes. */
function FieldControl(props: {
	label: string;
	type: PropertyType;
	value: PropertyValue;
	options: string[];
	disabled: boolean;
	onChange: (value: PropertyValue) => void;
}) {
	const { label, type, value, options, disabled, onChange } = props;
	switch (type) {
		case "text":
			return (
				<Input
					aria-label={label}
					placeholder="Empty"
					value={typeof value === "string" ? value : ""}
					disabled={disabled}
					onChange={(e) => onChange(e.target.value)}
				/>
			);
		case "number":
			return (
				<NumberField
					label={label}
					value={typeof value === "number" ? value : null}
					disabled={disabled}
					onChange={onChange}
				/>
			);
		case "date":
			return (
				<Input
					type="date"
					aria-label={label}
					value={typeof value === "string" ? value : ""}
					disabled={disabled}
					onChange={(e) =>
						onChange(e.target.value === "" ? null : e.target.value)
					}
				/>
			);
		case "checkbox":
			return (
				<Checkbox
					aria-label={label}
					checked={value === true}
					disabled={disabled}
					onCheckedChange={(checked) => onChange(checked === true)}
				/>
			);
		case "list":
			return (
				<CommitField
					label={label}
					placeholder="One, two, three"
					value={Array.isArray(value) ? value.join(", ") : ""}
					disabled={disabled}
					onCommit={(text) =>
						onChange(
							text
								.split(",")
								.map((part) => part.trim())
								.filter(
									(part, i, all) => part !== "" && all.indexOf(part) === i,
								),
						)
					}
				/>
			);
		case "select": {
			const current = typeof value === "string" && value !== "" ? value : null;
			if (options.length === 0 && current === null)
				return (
					<CommitField
						label={label}
						placeholder="Type a choice"
						value=""
						disabled={disabled}
						onCommit={(text) =>
							onChange(text.trim() === "" ? null : text.trim())
						}
					/>
				);
			const shown =
				current !== null && !options.includes(current)
					? [...options, current]
					: options;
			return (
				<Select
					value={current ?? NONE}
					disabled={disabled}
					onValueChange={(next) => onChange(next === NONE ? null : next)}
				>
					<SelectTrigger aria-label={label}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={NONE}>(no value)</SelectItem>
						{shown.map((option) => (
							<SelectItem key={option} value={option}>
								{option}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			);
		}
	}
}

/** The block's settings: mode, the field list, and for create mode the template and folder. */
function FormSettings(props: {
	config: FormConfig;
	source: FormSource | null;
	change: (patch: Partial<FormConfig>) => void;
}) {
	const { config, source, change } = props;
	const [templates, setTemplates] = useState<string[]>([]);
	const [name, setName] = useState("");
	const [type, setType] = useState<PropertyType>("text");
	const creating = config.mode === "create";
	useEffect(() => {
		if (!creating || !source) return;
		let live = true;
		source
			.templates()
			.then((list) => live && setTemplates(list.map((t) => t.label)))
			.catch(() => live && setTemplates([]));
		return () => {
			live = false;
		};
	}, [creating, source]);
	const existing = readProps(source?.props() ?? {}).filter(
		(item) => item.name.toLowerCase() !== "tags",
	);
	const taken = (candidate: string) =>
		config.fields.some((f) => f.name.toLowerCase() === candidate.toLowerCase());
	const add = () => {
		const match = existing.find(
			(item) => item.name.toLowerCase() === name.trim().toLowerCase(),
		);
		const field: FormField = {
			name: match?.name ?? name,
			type: match?.known ? match.type : type,
		};
		const next = normalizeForm({ fields: [...config.fields, field] }).fields;
		if (next.length === config.fields.length) return;
		change({ fields: next });
		setName("");
	};
	const edit = (index: number, patch: Partial<FormField>) =>
		change({
			fields: config.fields.map((f, i) =>
				i === index ? { ...f, ...patch } : f,
			),
		});
	return (
		<div className="form-settings">
			<div className="form-setting">
				<span>Mode</span>
				<Select
					value={config.mode}
					onValueChange={(mode) => change({ mode: mode as FormConfig["mode"] })}
				>
					<SelectTrigger aria-label="Form mode">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="fill">Fill this note</SelectItem>
						<SelectItem value="create">Create a note</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{creating && (
				<>
					<div className="form-setting">
						<span>Template</span>
						<Select
							value={config.template === "" ? NONE : config.template}
							onValueChange={(t) => change({ template: t === NONE ? "" : t })}
						>
							<SelectTrigger aria-label="Template">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Blank note</SelectItem>
								{[
									...templates,
									...(config.template && !templates.includes(config.template)
										? [config.template]
										: []),
								].map((t) => (
									<SelectItem key={t} value={t}>
										{t}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="form-setting">
						<span>Folder</span>
						<Select
							value={config.folder === "" ? NONE : config.folder}
							onValueChange={(f) => change({ folder: f === NONE ? "" : f })}
						>
							<SelectTrigger aria-label="Folder">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NONE}>Default location</SelectItem>
								{[
									...(source?.folders() ?? []),
									...(config.folder &&
									!(source?.folders() ?? []).includes(config.folder)
										? [config.folder]
										: []),
								].map((f) => (
									<SelectItem key={f} value={f}>
										{f}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</>
			)}
			<ul className="form-fields-list">
				{config.fields.map((field, index) => (
					<li key={field.name}>
						<span className="form-field-name">{field.name}</span>
						<Input
							aria-label={`Label for ${field.name}`}
							placeholder="Label"
							defaultValue={field.label ?? ""}
							onBlur={(e) => {
								const label = e.target.value.trim();
								if (label !== (field.label ?? ""))
									edit(index, { label: label || undefined });
							}}
						/>
						<Select
							value={field.type}
							onValueChange={(t) => edit(index, { type: t as PropertyType })}
						>
							<SelectTrigger aria-label={`Type of ${field.name}`}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PROPERTY_TYPES.map((t) => (
									<SelectItem key={t} value={t}>
										{TYPE_NAMES[t]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							variant="ghost"
							size="icon"
							aria-label={`Remove field ${field.name}`}
							onClick={() =>
								change({ fields: config.fields.filter((_, i) => i !== index) })
							}
						>
							<X aria-hidden="true" />
						</Button>
					</li>
				))}
			</ul>
			{config.fields.length < MAX_FORM_FIELDS && (
				<div className="form-add">
					<Input
						aria-label="Property for a new field"
						placeholder="Property name"
						list="form-block-properties"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								add();
							}
						}}
					/>
					<datalist id="form-block-properties">
						{existing
							.filter((item) => !taken(item.name))
							.map((item) => (
								<option key={item.name} value={item.name} />
							))}
					</datalist>
					<Select
						value={type}
						onValueChange={(t) => setType(t as PropertyType)}
					>
						<SelectTrigger aria-label="Type of new field">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{PROPERTY_TYPES.map((t) => (
								<SelectItem key={t} value={t}>
									{TYPE_NAMES[t]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						size="sm"
						variant="outline"
						disabled={name.trim() === "" || taken(name)}
						onClick={add}
					>
						Add field
					</Button>
				</div>
			)}
		</div>
	);
}

function FormView({ node, editor, getPos }: NodeViewProps) {
	const source = formOptions(editor)?.source() ?? null;
	const config = normalizeForm(node.attrs);
	const editable = useEditable(editor);
	const [, redraw] = useState(0);
	const [answers, setAnswers] = useState<Answers>({});
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
		null,
	);
	useEffect(() => source?.subscribe(() => redraw((n) => n + 1)), [source]);

	const change = (patch: Partial<FormConfig>) => {
		const pos = getPos();
		if (!editor.isEditable || typeof pos !== "number") return;
		editor.view.dispatch(
			editor.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				...patch,
			}),
		);
	};

	const settings = editable && (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="form-settings-button"
					aria-label="Form settings"
				>
					<Settings2 aria-hidden="true" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="form-settings-popover">
				<FormSettings config={config} source={source} change={change} />
			</PopoverContent>
		</Popover>
	);

	if (!source)
		return (
			<NodeViewWrapper className="form-block" contentEditable={false}>
				<p className="form-note">Forms work in a note's own page.</p>
			</NodeViewWrapper>
		);

	const props = source.props();
	const creating = config.mode === "create";
	const noteEditable = source.editable();
	const fillOff = !creating && (!noteEditable || props === null);

	const fill = (field: FormField, value: PropertyValue) => {
		const latest = source.props();
		if (!latest) return;
		const made = applyAnswer(latest, field, value);
		if (made.ok) {
			setMessage(null);
			source.setProps(made.props);
		} else setMessage({ ok: false, text: made.message });
	};

	const submit = async () => {
		setBusy(true);
		setMessage(null);
		try {
			const problem = await source.create({ config, answers });
			if (problem) setMessage({ ok: false, text: problem });
			else {
				setAnswers({});
				setMessage({ ok: true, text: "Created." });
			}
		} catch (e) {
			setMessage({
				ok: false,
				text: e instanceof Error ? e.message : "Could not create the note.",
			});
		} finally {
			setBusy(false);
		}
	};

	return (
		<NodeViewWrapper className="form-block" contentEditable={false}>
			{settings}
			{config.fields.length === 0 && (
				<p className="form-note">
					{editable
						? "No fields yet. Open the form settings to add some."
						: "This form has no fields."}
				</p>
			)}
			{!creating && props === null && (
				<p className="form-note">
					This note's properties are saved in a form this version can't edit.
					They are kept as they are.
				</p>
			)}
			{config.fields.map((field) => {
				const label = field.label || field.name;
				const view = creating
					? null
					: props === null
						? null
						: fieldView(props, field);
				return (
					<div className="form-row" key={field.name}>
						<span className="form-label">{label}</span>
						{creating ? (
							<FieldControl
								label={label}
								type={field.type}
								value={answers[field.name] ?? null}
								options={[]}
								disabled={false}
								onChange={(value) =>
									setAnswers((was) => ({ ...was, [field.name]: value }))
								}
							/>
						) : view?.kind === "value" ? (
							<FieldControl
								label={label}
								type={view.type}
								value={view.value}
								options={view.options}
								disabled={fillOff}
								onChange={(value) => fill(field, value)}
							/>
						) : view ? (
							<span className="form-note">Kept as it is</span>
						) : null}
					</div>
				);
			})}
			{creating && config.fields.length > 0 && (
				<div className="form-actions">
					<Button
						size="sm"
						disabled={busy || !source.canCreate()}
						onClick={() => void submit()}
					>
						Create
					</Button>
					{!source.canCreate() && (
						<span className="form-note">This vault is read-only.</span>
					)}
				</div>
			)}
			{message && (
				<p
					role={message.ok ? "status" : "alert"}
					className={message.ok ? "form-note" : "notice"}
				>
					{message.text}
				</p>
			)}
		</NodeViewWrapper>
	);
}

const json = (name: string, fallback: unknown) => ({
	default: fallback,
	parseHTML: (el: HTMLElement) => {
		try {
			return JSON.parse(el.dataset[name] ?? "null") ?? fallback;
		} catch {
			return fallback;
		}
	},
	renderHTML: (attrs: Record<string, unknown>) =>
		JSON.stringify(attrs[name]) === JSON.stringify(fallback)
			? {}
			: { [`data-${name}`]: JSON.stringify(attrs[name]) },
});

/**
 * A form: fields that fill this note's properties, or make a new note from a
 * template. Attrs: `mode`, `fields` (name, type, label), and for create mode
 * `template` and `folder`. Answers are never stored here.
 */
export const FormBlock = Node.create<FormOptions>({
	name: "formBlock",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,
	addOptions() {
		return { source: () => null };
	},
	addAttributes() {
		return {
			mode: json("mode", "fill"),
			fields: json("fields", []),
			template: json("template", ""),
			folder: json("folder", ""),
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-type="form"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["div", mergeAttributes(HTMLAttributes, { "data-type": "form" })];
	},
	addNodeView() {
		return ReactNodeViewRenderer(FormView, { ignoreMutation: () => true });
	},
});
