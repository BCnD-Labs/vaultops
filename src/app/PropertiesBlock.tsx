import { ChevronRight, Plus, Tag, Type } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { CloseButton } from "@/components/ui/close-button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	addProperty,
	type Change,
	findName,
	nextPropertyName,
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
import { Control } from "./PropertiesPanel";
import { AddPropertyMenu, PropertySettings } from "./PropertySettings";
import { PROPERTY_ICONS, TYPE_LABEL } from "./property-meta";
import { TagChips } from "./TagChips";
import { type TypeApi, TypeRow } from "./TypeRow";

const OPEN_KEY = "vaultops:properties-block-open";

export { PROPERTY_ICONS };

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
	/** The property whose settings popover is open. */
	const [settingsFor, setSettingsFor] = useState<string | null>(null);
	const root = useRef<HTMLElement>(null);

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
	/** Add a property named after its type (Date, Date 2…) and open its settings. */
	const add = (type: PropertyType) => {
		const name = nextPropertyName(props, TYPE_LABEL[type]);
		if (apply(addProperty(props, name, type)) === null) setSettingsFor(name);
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
						<TagChips
							tags={tags}
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
										<PropertySettings
											item={item}
											props={props}
											open={settingsFor === item.name}
											onOpenChange={(next) =>
												setSettingsFor(next ? item.name : null)
											}
											apply={apply}
											onRenamed={setSettingsFor}
											trigger={
												<button
													type="button"
													className="prop-type-icon"
													aria-label={`Settings for ${item.name} (${TYPE_LABEL[item.type]})`}
													title="Property settings"
												>
													<Icon aria-hidden="true" />
												</button>
											}
										/>
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
						<AddPropertyMenu
							onAdd={add}
							trigger={
								<button type="button" className="prop-add-row">
									<Plus aria-hidden="true" /> Add property
								</button>
							}
						/>
					)}
				</CollapsibleContent>
			</section>
		</Collapsible>
	);
}
