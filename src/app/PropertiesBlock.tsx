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
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { CloseButton } from "@/components/ui/close-button";
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
import { groupByType } from "../core/types/new-note";
import { Chips, Control, TYPE_LABEL } from "./PropertiesPanel";
import { type TypeApi, TypeRow } from "./TypeRow";

const OPEN_KEY = "vaultops:properties-block-open";

export const PROPERTY_ICONS = {
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
	/** Shows the type chip and puts the type's fields first. */
	typeApi?: TypeApi;
	/** Puts the type's template into the note (its own button next to the chip). */
	onInsertTemplate?: () => void;
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
	typeApi,
	onInsertTemplate,
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
	const grouped = groupByType(
		readProps(props).filter((item) => item.name !== tagsKey),
		typeApi?.types.find((t) => t.id === typeApi.typeId),
	);
	const items = grouped.items;
	if (!editable && items.length === 0 && tags.length === 0 && !typeApi?.typeId)
		return null;

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
					{typeApi && (
						<TypeRow
							api={typeApi}
							editable={editable}
							icon
							onInsertTemplate={onInsertTemplate}
						/>
					)}
					{items.map((item, index) => {
						const Icon = item.known ? PROPERTY_ICONS[item.type] : Type;
						return (
							<Fragment key={item.name}>
								{index === grouped.fieldCount && index > 0 && (
									<p className="prop-group-title">Other properties</p>
								)}
								<div className="prop-row" data-property={item.name}>
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
															changeType(
																props,
																item.name,
																value as PropertyType,
															),
														)
													}
												>
													{PROPERTY_TYPES.map((t) => {
														const TypeIcon = PROPERTY_ICONS[t];
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
										onRename={(to) =>
											apply(renameProperty(props, item.name, to))
										}
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
											{item.type ? `${item.type} property` : "property"}: kept
											as it is
										</span>
									)}
									{grouped.mismatched.has(item.name) && (
										<span className="read-only-tag">
											doesn't match the type
										</span>
									)}
									{editable && (
										<CloseButton
											className="prop-remove"
											label={`Remove property ${item.name}`}
											title="Remove property"
											onClick={() => onChange(removeProperty(props, item.name))}
										/>
									)}
								</div>
							</Fragment>
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
										const TypeIcon = PROPERTY_ICONS[t];
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
