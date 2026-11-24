import { Check, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	type Change,
	changeType,
	cleanOptions,
	PROPERTY_TYPES,
	type PropertyItem,
	type PropertyType,
	type Props,
	removeProperty,
	renameProperty,
	setOptions,
} from "../core/notes/properties";
import { Chips } from "./PropertiesPanel";
import { PROPERTY_ICONS, TYPE_LABEL } from "./property-meta";

/** The list of types; clicking one adds a property of that type. */
export function AddPropertyMenu(props: {
	onAdd: (type: PropertyType) => void;
	trigger: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
			<PopoverContent
				align="start"
				className="prop-add-popover w-48 p-1"
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<ul className="prop-type-list">
					{PROPERTY_TYPES.map((t) => {
						const TypeIcon = PROPERTY_ICONS[t];
						return (
							<li key={t}>
								<button
									type="button"
									aria-label={`Add ${TYPE_LABEL[t]} property`}
									onClick={() => {
										setOpen(false);
										props.onAdd(t);
									}}
								>
									<TypeIcon aria-hidden="true" /> {TYPE_LABEL[t]}
								</button>
							</li>
						);
					})}
				</ul>
			</PopoverContent>
		</Popover>
	);
}

/**
 * One property's settings in a popover: its name, its type, a select's options
 * (the same list the row's gear edits) and removing it. Every change applies
 * at once, like the rest of the properties.
 */
export function PropertySettings(props: {
	item: Extract<PropertyItem, { known: true }>;
	props: Props;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Apply a change; returns the refusal message, or null when it worked. */
	apply: (change: Change) => string | null;
	onRenamed: (to: string) => void;
	trigger: ReactNode;
}) {
	const { item } = props;
	const [draft, setDraft] = useState(item.name);
	const [message, setMessage] = useState<string | null>(null);
	useEffect(() => setDraft(item.name), [item.name]);

	const run = (change: Change) => setMessage(props.apply(change));
	// Blur and closing can both ask for the same rename; apply it once.
	const lastRename = useRef("");
	const rename = () => {
		const to = draft.trim().replace(/\s+/g, " ");
		const key = `${item.name}\n${to}`;
		if (to === item.name || lastRename.current === key) return;
		lastRename.current = key;
		const refused = props.apply(renameProperty(props.props, item.name, draft));
		setMessage(refused);
		if (refused === null) props.onRenamed(to);
		else setDraft(item.name);
	};
	const options = item.options ?? [];

	return (
		<Popover
			open={props.open}
			onOpenChange={(next) => {
				if (!next) rename();
				setMessage(null);
				props.onOpenChange(next);
			}}
		>
			<PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
			<PopoverContent
				align="start"
				className="prop-settings"
				aria-label={`Settings for ${item.name}`}
			>
				<label className="prop-settings-field">
					<span>Name</span>
					<input
						aria-label="Property name"
						value={draft}
						onFocus={(e) => e.currentTarget.select()}
						onChange={(e) => setDraft(e.target.value)}
						onBlur={rename}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								rename();
							}
						}}
					/>
				</label>
				<fieldset className="prop-settings-types prop-type-list">
					<legend className="prop-settings-label">Type</legend>
					{PROPERTY_TYPES.map((t) => {
						const TypeIcon = PROPERTY_ICONS[t];
						return (
							<button
								key={t}
								type="button"
								aria-pressed={item.type === t}
								onClick={() => run(changeType(props.props, item.name, t))}
							>
								<TypeIcon aria-hidden="true" />
								{TYPE_LABEL[t]}
								{item.type === t && (
									<Check className="prop-settings-check" aria-hidden="true" />
								)}
							</button>
						);
					})}
				</fieldset>
				{item.type === "select" && (
					<>
						<p className="prop-settings-label">Options</p>
						<Chips
							label={`${item.name} options`}
							items={options}
							editable
							onAdd={(x) =>
								run(setOptions(props.props, item.name, [...options, x]))
							}
							onRemove={(x) =>
								run(
									setOptions(
										props.props,
										item.name,
										cleanOptions(options.filter((o) => o !== x)),
									),
								)
							}
						/>
					</>
				)}
				{message && (
					<p role="alert" className="notice">
						{message}
					</p>
				)}
				<Button
					variant="ghost"
					size="sm"
					className="prop-settings-remove"
					onClick={() => {
						props.onOpenChange(false);
						props.apply({
							ok: true,
							props: removeProperty(props.props, item.name),
						});
					}}
				>
					<Trash2 aria-hidden="true" /> Remove property
				</Button>
			</PopoverContent>
		</Popover>
	);
}
