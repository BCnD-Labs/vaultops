import { ArrowDown, ArrowUp, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
	changeOp,
	fieldKey,
	isMissing,
	knownProps,
	newCondition,
	opChoiceKey,
	opKey,
	opsFor,
	propConditionValue,
	type ViewChoices,
} from "../../core/views/edit";
import {
	normalizeCondition,
	propName,
	type SortKey,
} from "../../core/views/rule";
import {
	BUILT_LAYOUTS,
	LAYOUTS,
	type ViewSettings,
} from "../../core/views/view-attrs";

type Raw = Record<string, unknown>;
const NONE = "__none__";
const LAYOUT_NAMES = {
	table: "Table",
	board: "Board",
	gallery: "Gallery",
	calendar: "Calendar",
};

function Pick({
	value,
	items,
	label,
	onChange,
}: {
	value: string;
	items: { value: string; label: string }[];
	label: string;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const shown = items.find((i) => i.value === value)?.label ?? value;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="lv-pick"
					aria-label={label}
				>
					<span className="lv-pick-text">{shown || "Choose…"}</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="lv-pick-list">
				<Command>
					<CommandInput placeholder="Search…" />
					<CommandList>
						<CommandEmpty>Nothing found</CommandEmpty>
						{items.map((item) => (
							<CommandItem
								key={item.value}
								value={`${item.label} ${item.value}`}
								onSelect={() => {
									onChange(item.value);
									setOpen(false);
								}}
							>
								{item.label}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function Choose({
	value,
	items,
	label,
	onChange,
}: {
	value: string;
	items: { value: string; label: string }[];
	label: string;
	onChange: (value: string) => void;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger aria-label={label} className="lv-select">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{items.map((i) => (
					<SelectItem key={i.value} value={i.value}>
						{i.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

function ConditionRow({
	raw,
	index,
	choices,
	known,
	today,
	onChange,
	onRemove,
}: {
	raw: Raw;
	index: number;
	choices: ViewChoices;
	known: ReadonlySet<string>;
	today: string;
	onChange: (next: Raw) => void;
	onRemove: () => void;
}) {
	const key = fieldKey(raw);
	const name = propName(raw.field);
	const prop = choices.props.find(
		(p) => p.name.toLowerCase() === name?.toLowerCase(),
	);
	const missing = isMissing({ field: raw.field }, known);
	const complete = normalizeCondition(raw) !== null;
	const fields = [
		{ value: "folder", label: "Folder" },
		{ value: "tag:has", label: "Has tag" },
		{ value: "tag:not", label: "Does not have tag" },
		{ value: "type", label: "Type" },
		{ value: "linked:to", label: "Links to" },
		{ value: "linked:from", label: "Linked from" },
		...choices.props.map((p) => ({ value: `prop:${p.name}`, label: p.name })),
		...(missing && name ? [{ value: key, label: name }] : []),
	];
	const set = (patch: Raw) => onChange({ ...raw, ...patch });
	const text = (value: unknown) => (typeof value === "string" ? value : "");
	let control: ReactNode = null;
	if (key === "folder") {
		control = (
			<Pick
				label="Folder"
				value={text(raw.value)}
				items={[
					{ value: "", label: "Vault root" },
					...choices.folders.map((f) => ({ value: f, label: f })),
				]}
				onChange={(value) => set({ value })}
			/>
		);
	} else if (raw.field === "tag") {
		control = (
			<Pick
				label="Tag"
				value={text(raw.value)}
				items={choices.tags.map((t) => ({ value: t, label: t }))}
				onChange={(value) => set({ value })}
			/>
		);
	} else if (raw.field === "type") {
		const id = Array.isArray(raw.value) ? text(raw.value[0]) : "";
		control = (
			<Pick
				label="Type"
				value={id}
				items={choices.types.map((t) => ({ value: t, label: t }))}
				onChange={(value) => set({ value: [value] })}
			/>
		);
	} else if (raw.field === "linked") {
		control = (
			<Pick
				label="Note"
				value={text(raw.value)}
				items={choices.notes.map((n) => ({ value: n.id, label: n.title }))}
				onChange={(value) => set({ value })}
			/>
		);
	}
	const ops = opsFor(prop?.type);
	const op = ops.find((o) => opChoiceKey(o) === opKey(raw.op, raw.value));
	const typed = (input: string) =>
		propConditionValue(op?.input ?? "text", input);
	const hasOptions = (prop?.options.length ?? 0) > 0;
	const showInput =
		!control &&
		op !== undefined &&
		(["text", "number", "date", "options"].includes(op.input) ||
			(op.input === "option" && !hasOptions));
	const sticky = `${index}-${key}-${String(raw.op)}`;
	const value = Array.isArray(raw.value) ? raw.value.join(", ") : raw.value;
	return (
		<div className="lv-condition" data-missing={missing || undefined}>
			<Choose
				label="Field"
				value={key}
				items={fields}
				onChange={(next) => onChange(newCondition(next, choices))}
			/>
			{control}
			{control && raw.field !== "type" && raw.field !== "linked" && (
				<Label className="lv-check">
					<Checkbox
						checked={raw.sub !== false}
						onCheckedChange={(on) => set({ sub: on === true })}
						aria-label={
							raw.field === "tag" ? "Include sub-tags" : "Include subfolders"
						}
					/>
					{raw.field === "tag" ? "Sub-tags" : "Subfolders"}
				</Label>
			)}
			{!control && (
				<Choose
					label="Condition"
					value={op ? opChoiceKey(op) : opKey(raw.op, raw.value)}
					items={
						op
							? ops.map((o) => ({ value: opChoiceKey(o), label: o.label }))
							: [{ value: opKey(raw.op, raw.value), label: String(raw.op) }]
					}
					onChange={(next) => {
						const choice = ops.find((o) => opChoiceKey(o) === next);
						if (choice)
							onChange(changeOp(raw, choice, prop?.options ?? [], today));
					}}
				/>
			)}
			{!control && op?.input === "option" && prop && hasOptions && (
				<Choose
					label="Value"
					value={text(raw.value)}
					items={prop.options.map((o) => ({ value: o, label: o }))}
					onChange={(next) => set({ value: next })}
				/>
			)}
			{showInput && (
				<Input
					key={sticky}
					className="lv-input"
					aria-label="Value"
					placeholder={op.input === "options" ? "a, b, c" : "Value"}
					type={
						op.input === "number" || op.input === "date" ? op.input : "text"
					}
					defaultValue={value === undefined ? "" : String(value)}
					onChange={(e) => {
						const next = typed(e.target.value);
						const { value: _drop, ...rest } = raw;
						onChange(next === undefined ? rest : { ...rest, value: next });
					}}
				/>
			)}
			{missing && <span className="lv-warn">Property missing</span>}
			{!missing && !complete && <span className="lv-warn">Needs a value</span>}
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label="Remove condition"
				onClick={onRemove}
			>
				<X />
			</Button>
		</div>
	);
}

/** Edit view: menus for the rule, sort, group, columns and layout (no query language). */
export function RuleEditor({
	rule,
	settings,
	choices,
	today,
	onChange,
}: {
	/** The stored conditions, as written (incomplete ones stay until finished). */
	rule: { match: "all" | "any"; conditions: Raw[] };
	settings: ViewSettings;
	choices: ViewChoices;
	today: string;
	onChange: (patch: Raw) => void;
}) {
	const known = knownProps(choices);
	const setRule = (next: Partial<typeof rule>) =>
		onChange({ rule: { ...rule, ...next } });
	const setCondition = (i: number, next: Raw | null) =>
		setRule({
			conditions: rule.conditions.flatMap((c, j) =>
				j !== i ? [c] : next ? [next] : [],
			),
		});
	const fieldItems = [
		{ value: NONE, label: "None" },
		{ value: "title", label: "Name" },
		{ value: "type", label: "Type" },
		...choices.props.map((p) => ({ value: `prop:${p.name}`, label: p.name })),
	];
	const setSort = (i: number, field: string, dir?: SortKey["dir"]) => {
		const next = settings.sort.slice();
		if (field === NONE) next.splice(i, 1);
		else next[i] = { field, dir: dir ?? next[i]?.dir ?? "asc" };
		onChange({ sort: next });
	};
	const groups = [
		{ value: NONE, label: "None" },
		{ value: "tag", label: "Tag" },
		{ value: "type", label: "Type" },
		...choices.props.map((p) => ({ value: `prop:${p.name}`, label: p.name })),
	];
	const columns = [
		...new Set([
			"type",
			...choices.props.map((p) => `prop:${p.name}`),
			...settings.columns.slice(1),
		]),
	];
	const shown = new Set(settings.columns.map((c) => c.toLowerCase()));
	const toggleColumn = (field: string, on: boolean) =>
		onChange({
			columns: [
				"title",
				...columns.filter((c) =>
					c === field ? on : shown.has(c.toLowerCase()),
				),
			],
		});
	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button type="button" variant="ghost" size="sm">
					<SlidersHorizontal />
					Edit view
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="lv-panel">
				<section>
					<h4>Show notes</h4>
					{rule.conditions.length > 1 && (
						<div className="lv-row">
							Match
							<Choose
								label="Match"
								value={rule.match}
								items={[
									{ value: "all", label: "all" },
									{ value: "any", label: "any" },
								]}
								onChange={(match) => setRule({ match: match as "all" | "any" })}
							/>
							of these
						</div>
					)}
					{rule.conditions.map((raw, i) => (
						<ConditionRow
							// biome-ignore lint/suspicious/noArrayIndexKey: conditions have no id
							key={i}
							raw={raw}
							index={i}
							choices={choices}
							known={known}
							today={today}
							onChange={(next) => setCondition(i, next)}
							onRemove={() => setCondition(i, null)}
						/>
					))}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() =>
							setRule({
								conditions: [
									...rule.conditions,
									newCondition("folder", choices),
								],
							})
						}
					>
						Add condition
					</Button>
				</section>
				<section>
					<h4>Sort</h4>
					{[...settings.sort, undefined].slice(0, 2).map((key, i) => (
						<div className="lv-row" key={key?.field ?? "new"}>
							<Choose
								label={i === 0 ? "Sort by" : "Then by"}
								value={key?.field ?? NONE}
								items={fieldItems}
								onChange={(field) => setSort(i, field)}
							/>
							{key && (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={key.dir === "asc" ? "Ascending" : "Descending"}
									onClick={() =>
										setSort(i, key.field, key.dir === "asc" ? "desc" : "asc")
									}
								>
									{key.dir === "asc" ? <ArrowUp /> : <ArrowDown />}
								</Button>
							)}
						</div>
					))}
				</section>
				<section>
					<h4>Group and layout</h4>
					<div className="lv-row">
						Group by
						<Choose
							label="Group by"
							value={settings.group ?? NONE}
							items={groups}
							onChange={(group) =>
								onChange({ group: group === NONE ? null : group })
							}
						/>
					</div>
					<div className="lv-row">
						Layout
						<Choose
							label="Layout"
							value={settings.layout}
							items={LAYOUTS.map((l) => ({
								value: l,
								label: BUILT_LAYOUTS.includes(l)
									? LAYOUT_NAMES[l]
									: `${LAYOUT_NAMES[l]} (shows as table for now)`,
							}))}
							onChange={(layout) => onChange({ layout })}
						/>
					</div>
				</section>
				<section>
					<h4>Columns</h4>
					<div className="lv-columns">
						{columns.map((field) => (
							<Label className="lv-check" key={field}>
								<Checkbox
									checked={shown.has(field.toLowerCase())}
									onCheckedChange={(on) => toggleColumn(field, on === true)}
								/>
								{field === "type" ? "Type" : (propName(field) ?? field)}
							</Label>
						))}
					</div>
				</section>
			</PopoverContent>
		</Popover>
	);
}
