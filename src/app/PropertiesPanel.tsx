import { Plus, Settings2, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { SegmentedInput } from "@/components/ui/segmented";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	addProperty,
	cleanOptions,
	findName,
	isStray,
	PROPERTY_TYPES,
	type PropertyItem,
	type PropertyType,
	type PropertyValue,
	type Props,
	readProps,
	removeProperty,
	setOptions,
	setValue,
} from "../core/notes/properties";
import { addTag, removeTag, tagsOf } from "../core/notes/tags";
import { useAppearance } from "./AppearanceContext";
import { tagTone } from "./appearance";

interface PanelProps {
	/** The note's properties; null when the file keeps them in a form we can't edit. */
	props: Props | null;
	editable: boolean;
	onChange: (next: Props) => void;
	/** A tag was clicked: show the notes that carry it. */
	onOpenTag: (tag: string) => void;
}

export const TYPE_LABEL: Record<PropertyType, string> = {
	text: "Text",
	number: "Number",
	date: "Date",
	checkbox: "Checkbox",
	list: "List",
	select: "Select",
};

/** Up to this many options show as segments; more use a dropdown. */
export const SEGMENT_MAX = 5;

function SelectControl(props: {
	item: Extract<PropertyItem, { known: true }>;
	editable: boolean;
	onValue: (value: PropertyValue) => void;
	onOptions?: (options: string[]) => void;
}) {
	const { item, editable, onValue, onOptions } = props;
	const options = item.options ?? [];
	const value = typeof item.value === "string" ? item.value : null;
	const stray = isStray(item);
	return (
		<span className="select-prop">
			{options.length <= SEGMENT_MAX ? (
				<SegmentedInput
					label={item.name}
					options={options.map((o) => ({ value: o, label: o }))}
					value={value !== null && options.includes(value) ? value : null}
					onChange={(v) => onValue(v)}
					disabled={!editable}
				/>
			) : (
				<Select
					value={value ?? undefined}
					onValueChange={onValue}
					disabled={!editable}
				>
					<SelectTrigger aria-label={item.name}>
						<SelectValue placeholder="Empty" />
					</SelectTrigger>
					<SelectContent>
						{stray && value !== null && (
							<SelectItem value={value}>{value} (not an option)</SelectItem>
						)}
						{options.map((o) => (
							<SelectItem key={o} value={o}>
								{o}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
			{options.length > SEGMENT_MAX && editable && value !== null && (
				<button
					type="button"
					className="chip-remove"
					aria-label={`Clear ${item.name}`}
					title="Clear"
					onClick={() => onValue(null)}
				>
					<X className="tree-icon" aria-hidden="true" />
				</button>
			)}
			{stray && (
				<span className="read-only-tag" role="status">
					{value} is not an option
					{editable && (
						<>
							{" "}
							<button
								type="button"
								className="chip-label"
								onClick={() => onOptions?.([...options, value as string])}
							>
								Add it
							</button>
						</>
					)}
				</span>
			)}
			{editable && onOptions && (
				<Popover>
					<PopoverTrigger
						className="chip-remove"
						aria-label={`Edit options of ${item.name}`}
						title="Edit options"
					>
						<Settings2 className="tree-icon" aria-hidden="true" />
					</PopoverTrigger>
					<PopoverContent align="start">
						<Chips
							label={`${item.name} options`}
							items={options}
							editable
							onAdd={(x) => onOptions(cleanOptions([...options, x]))}
							onRemove={(x) => onOptions(options.filter((o) => o !== x))}
						/>
					</PopoverContent>
				</Popover>
			)}
		</span>
	);
}

/** Chips with a small field to add one more (used for tags and list properties). */
export function Chips(props: {
	label: string;
	items: string[];
	editable: boolean;
	onAdd: (item: string) => void;
	onRemove: (item: string) => void;
	onPick?: (item: string) => void;
}) {
	const [draft, setDraft] = useState("");
	const { appearance } = useAppearance();
	const add = () => {
		if (draft.trim() === "") return;
		props.onAdd(draft);
		setDraft("");
	};
	return (
		<span className="chips">
			{props.items.map((item) => (
				<span
					key={item}
					className="chip"
					data-tone={
						props.label === "tags" ? tagTone(item, appearance) : undefined
					}
				>
					{props.onPick ? (
						<button
							type="button"
							className="chip-label"
							title={`Show notes tagged ${item}`}
							onClick={() => props.onPick?.(item)}
						>
							{item}
						</button>
					) : (
						<span>{item}</span>
					)}
					{props.editable && (
						<button
							type="button"
							className="chip-remove"
							aria-label={`Remove ${item} from ${props.label}`}
							title={`Remove ${item} from ${props.label}`}
							onClick={() => props.onRemove(item)}
						>
							<X className="tree-icon" aria-hidden="true" />
						</button>
					)}
				</span>
			))}
			{props.editable && (
				<input
					className="chip-input"
					aria-label={`Add to ${props.label}`}
					placeholder={props.label === "tags" ? "Add tag" : "Add…"}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === ",") {
							e.preventDefault();
							add();
						}
					}}
					onBlur={add}
				/>
			)}
		</span>
	);
}

export function Control(props: {
	item: Extract<PropertyItem, { known: true }>;
	editable: boolean;
	onValue: (value: PropertyValue) => void;
	/** Select only: replace its option list. */
	onOptions?: (options: string[]) => void;
}) {
	const { item, editable, onValue } = props;
	const label = item.name;
	switch (item.type) {
		case "select":
			return (
				<SelectControl
					item={item}
					editable={editable}
					onValue={onValue}
					onOptions={props.onOptions}
				/>
			);
		case "text":
			return (
				<input
					aria-label={label}
					placeholder="Empty"
					value={item.value as string}
					disabled={!editable}
					onChange={(e) => onValue(e.target.value)}
				/>
			);
		case "number":
			return (
				<input
					aria-label={label}
					type="number"
					placeholder="Empty"
					defaultValue={(item.value as number | null) ?? ""}
					disabled={!editable}
					onChange={(e) => {
						const n = e.target.value === "" ? null : Number(e.target.value);
						if (n === null || Number.isFinite(n)) onValue(n);
					}}
				/>
			);
		case "date":
			return (
				<input
					aria-label={label}
					type="date"
					value={(item.value as string | null) ?? ""}
					disabled={!editable}
					onChange={(e) =>
						onValue(e.target.value === "" ? null : e.target.value)
					}
				/>
			);
		case "checkbox":
			return (
				<input
					aria-label={label}
					type="checkbox"
					checked={item.value as boolean}
					disabled={!editable}
					onChange={(e) => onValue(e.target.checked)}
				/>
			);
		case "list": {
			const items = item.value as string[];
			return (
				<Chips
					label={label}
					items={items}
					editable={editable}
					onAdd={(x) => {
						const next = x.trim();
						if (next && !items.includes(next)) onValue([...items, next]);
					}}
					onRemove={(x) => onValue(items.filter((i) => i !== x))}
				/>
			);
		}
	}
}

/** The note's properties: name on the left, value on the right. */
export function PropertiesPanel({
	props,
	editable,
	onChange,
	onOpenTag,
}: PanelProps) {
	const [adding, setAdding] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [type, setType] = useState<PropertyType>("text");

	if (props === null) {
		return (
			<p className="notice">
				This note's properties are saved in a form this version can't edit. They
				are kept as they are.
			</p>
		);
	}
	const tagsKey = findName(props, "tags");
	const items = readProps(props).filter((item) => item.name !== tagsKey);
	const apply = (
		change: { ok: true; props: Props } | { ok: false; message: string },
	) => {
		if (change.ok) {
			setMessage(null);
			onChange(change.props);
		} else {
			setMessage(change.message);
		}
	};

	return (
		<section className="props" aria-label="Properties">
			<div className="prop-row">
				<span className="prop-name">Tags</span>
				<Chips
					label="tags"
					items={tagsOf(props)}
					editable={editable}
					onAdd={(tag) => apply(addTag(props, tag))}
					onRemove={(tag) => onChange(removeTag(props, tag))}
					onPick={onOpenTag}
				/>
			</div>
			{items.map((item) => (
				<div
					key={item.name}
					className="prop-row"
					data-property={item.name}
					tabIndex={-1}
				>
					<span className="prop-name" title={item.name}>
						{item.name}
					</span>
					{item.known ? (
						<Control
							item={item}
							editable={editable}
							onValue={(value) => apply(setValue(props, item.name, value))}
							onOptions={(o) => apply(setOptions(props, item.name, o))}
						/>
					) : (
						<span className="read-only-tag">
							{item.type ? `${item.type} property` : "property"}: kept as it is
						</span>
					)}
					{editable && (
						<button
							type="button"
							className="chip-remove"
							aria-label={`Remove property ${item.name}`}
							title="Remove property"
							onClick={() => onChange(removeProperty(props, item.name))}
						>
							<X className="tree-icon" aria-hidden="true" />
						</button>
					)}
				</div>
			))}
			{editable && (
				<Popover open={adding} onOpenChange={setAdding}>
					<PopoverTrigger asChild>
						<Button variant="ghost" size="sm" className="prop-add-trigger">
							<Plus aria-hidden="true" /> Add property
						</Button>
					</PopoverTrigger>
					<PopoverContent align="start">
						<form
							className="prop-add"
							onSubmit={(e) => {
								e.preventDefault();
								const made = addProperty(props, name, type);
								apply(made);
								if (made.ok) {
									setName("");
									setAdding(false);
								}
							}}
						>
							<input
								aria-label="New property name"
								placeholder="New property"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
							<Select
								value={type}
								onValueChange={(value) => setType(value as PropertyType)}
							>
								<SelectTrigger aria-label="New property type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PROPERTY_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{TYPE_LABEL[t]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button size="sm" variant="secondary" type="submit">
								Add property
							</Button>
						</form>
						{message && (
							<p role="alert" className="notice">
								{message}
							</p>
						)}
					</PopoverContent>
				</Popover>
			)}
			{message && !adding && (
				<p role="alert" className="notice">
					{message}
				</p>
			)}
		</section>
	);
}
