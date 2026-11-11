import {
	Calendar,
	CheckSquare,
	ChevronRight,
	ChevronsUpDown,
	Hash,
	List,
	Plus,
	Tag,
	Type,
	X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	addProperty,
	type Change,
	changeType,
	findName,
	PROPERTY_TYPES,
	type PropertyType,
	type Props,
	readProps,
	removeProperty,
	renameProperty,
	setOptions,
	setValue,
} from "../core/notes/properties";
import { addTag, removeTag, tagsOf } from "../core/notes/tags";
import { Chips, Control, TYPE_LABEL } from "./PropertiesPanel";

const OPEN_KEY = "vaultops:properties-block-open";

const ICONS = {
	text: Type,
	number: Hash,
	date: Calendar,
	checkbox: CheckSquare,
	list: List,
	select: ChevronsUpDown,
};

interface BlockProps {
	/** The note's properties; null when the file keeps them in a form we can't edit. */
	props: Props | null;
	editable: boolean;
	onChange: (next: Props) => void;
	/** A tag was clicked: show the notes that carry it. */
	onOpenTag?: (tag: string) => void;
}

/** The name column: edits in place, Enter or leaving the field renames, Escape reverts. */
function NameField(props: {
	name: string;
	editable: boolean;
	onRename: (to: string) => string | null;
}) {
	const [draft, setDraft] = useState(props.name);
	useEffect(() => setDraft(props.name), [props.name]);
	const commit = () => {
		if (draft === props.name) return;
		if (props.onRename(draft) !== null) setDraft(props.name);
	};
	return (
		<input
			className="prop-name-field"
			aria-label={`Property name ${props.name}`}
			value={draft}
			readOnly={!props.editable}
			onChange={(e) => setDraft(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					commit();
				} else if (e.key === "Escape") {
					setDraft(props.name);
				}
			}}
		/>
	);
}

/**
 * The note's properties under the title, laid out like stock Obsidian: one row
 * each with a type icon, a muted name and a value that matches the type, then a
 * row to add another. The sidebar's Properties tab edits the same data.
 */
export function PropertiesBlock({
	props,
	editable,
	onChange,
	onOpenTag,
}: BlockProps) {
	const [open, setOpen] = useState(() => {
		try {
			return localStorage.getItem(OPEN_KEY) !== "false";
		} catch {
			return true;
		}
	});
	const [message, setMessage] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	const [name, setName] = useState("");
	const [focusName, setFocusName] = useState<string | null>(null);
	const root = useRef<HTMLElement>(null);

	// After adding, put the cursor in the new row's value field.
	useEffect(() => {
		if (focusName === null) return;
		const rows = root.current?.querySelectorAll<HTMLElement>("[data-property]");
		const row = Array.from(rows ?? []).find(
			(r) => r.dataset.property === focusName,
		);
		row?.querySelector<HTMLElement>("input:not(.prop-name-field)")?.focus();
		setFocusName(null);
	}, [focusName]);

	if (props === null) {
		return (
			<p className="notice props-block">
				This note's properties are saved in a form this version can't edit. They
				are kept as they are.
			</p>
		);
	}
	const tagsKey = findName(props, "tags");
	const tags = tagsOf(props);
	const items = readProps(props).filter((item) => item.name !== tagsKey);
	if (!editable && items.length === 0 && tags.length === 0) return null;

	/** Apply a change; returns the refusal message, or null when it worked. */
	const apply = (change: Change): string | null => {
		if (change.ok) {
			setMessage(null);
			onChange(change.props);
			return null;
		}
		setMessage(change.message);
		return change.message;
	};
	const toggle = (next: boolean) => {
		setOpen(next);
		try {
			localStorage.setItem(OPEN_KEY, String(next));
		} catch {
			/* Storage is optional. */
		}
	};
	const add = (type: PropertyType) => {
		const made = addProperty(props, name, type);
		if (apply(made) === null) {
			setFocusName(name.trim().replace(/\s+/g, " "));
			setName("");
			setAdding(false);
		}
	};

	return (
		<Collapsible asChild open={open} onOpenChange={toggle}>
			<section ref={root} className="props props-block" aria-label="Properties">
				<CollapsibleTrigger className="props-block-header">
					<ChevronRight aria-hidden="true" />
					Properties
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="prop-row">
						<span className="prop-type-icon" aria-hidden="true">
							<Tag />
						</span>
						<span className="prop-name">tags</span>
						<Chips
							label="tags"
							items={tags}
							editable={editable}
							onAdd={(tag) => apply(addTag(props, tag))}
							onRemove={(tag) => onChange(removeTag(props, tag))}
							onPick={onOpenTag}
						/>
					</div>
					{items.map((item) => {
						const Icon = item.known ? ICONS[item.type] : Type;
						return (
							<div
								key={item.name}
								className="prop-row"
								data-property={item.name}
							>
								{item.known && editable ? (
									<DropdownMenu>
										<DropdownMenuTrigger
											className="prop-type-icon"
											aria-label={`Type of ${item.name}: ${TYPE_LABEL[item.type]}`}
											title="Change type"
										>
											<Icon aria-hidden="true" />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="start">
											<DropdownMenuRadioGroup
												value={item.type}
												onValueChange={(value) =>
													apply(
														changeType(props, item.name, value as PropertyType),
													)
												}
											>
												{PROPERTY_TYPES.map((t) => {
													const TypeIcon = ICONS[t];
													return (
														<DropdownMenuRadioItem key={t} value={t}>
															<TypeIcon aria-hidden="true" /> {TYPE_LABEL[t]}
														</DropdownMenuRadioItem>
													);
												})}
											</DropdownMenuRadioGroup>
										</DropdownMenuContent>
									</DropdownMenu>
								) : (
									<span className="prop-type-icon" aria-hidden="true">
										<Icon />
									</span>
								)}
								<NameField
									name={item.name}
									editable={editable}
									onRename={(to) => apply(renameProperty(props, item.name, to))}
								/>
								{item.known ? (
									<Control
										item={item}
										editable={editable}
										onValue={(value) =>
											apply(setValue(props, item.name, value))
										}
										onOptions={(o) => apply(setOptions(props, item.name, o))}
									/>
								) : (
									<span className="read-only-tag">
										{item.type ? `${item.type} property` : "property"}: kept as
										it is
									</span>
								)}
								{editable && (
									<button
										type="button"
										className="chip-remove prop-remove"
										aria-label={`Remove property ${item.name}`}
										title="Remove property"
										onClick={() => onChange(removeProperty(props, item.name))}
									>
										<X className="tree-icon" aria-hidden="true" />
									</button>
								)}
							</div>
						);
					})}
					{message && (
						<p role="alert" className="notice">
							{message}
						</p>
					)}
					{editable && (
						<Popover
							open={adding}
							onOpenChange={(next) => {
								setAdding(next);
								if (!next) setMessage(null);
							}}
						>
							<PopoverTrigger className="prop-add-row">
								<Plus aria-hidden="true" /> Add property
							</PopoverTrigger>
							<PopoverContent align="start" className="prop-add-popover">
								<input
									aria-label="New property name"
									placeholder="Property name"
									value={name}
									// biome-ignore lint/a11y/noAutofocus: the popover exists to type a name.
									autoFocus
									onChange={(e) => setName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											add("text");
										}
									}}
								/>
								<ul className="prop-type-list">
									{PROPERTY_TYPES.map((t) => {
										const TypeIcon = ICONS[t];
										return (
											<li key={t}>
												<button
													type="button"
													aria-label={`Add ${TYPE_LABEL[t]} property`}
													onClick={() => add(t)}
												>
													<TypeIcon aria-hidden="true" /> {TYPE_LABEL[t]}
												</button>
											</li>
										);
									})}
								</ul>
							</PopoverContent>
						</Popover>
					)}
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
