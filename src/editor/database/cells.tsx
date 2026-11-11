import { Check, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	type Cells,
	type CellValue,
	type DbColumn,
	ensureOption,
	PROGRESS_STEPS,
	readCell,
	type SelectOption,
	STATUS_GROUP_LABELS,
	STATUS_GROUPS,
	snapProgress,
} from "./model";

/**
 * One cell editor per column type. Each gets the row's cells and reports a new
 * value through `onChange`; select cells also report the column, because
 * typing a new option name adds the option to the column in the same step.
 */
export interface CellProps {
	column: DbColumn;
	cells: Cells;
	editable: boolean;
	onChange: (value: CellValue) => void;
	onOptionChange: (column: DbColumn, value: CellValue) => void;
	/** Shown in the title cell's empty state and used for labels. */
	placeholder?: string;
	autoFocus?: boolean;
}

/** Blur on Enter and Escape so the keys don't reach the note editor. */
function finishOnEnter(event: KeyboardEvent<HTMLInputElement>) {
	if (event.key === "Enter" || event.key === "Escape") {
		event.preventDefault();
		event.currentTarget.blur();
	}
}

function TextCell({
	column,
	cells,
	editable,
	onChange,
	placeholder,
	autoFocus,
}: CellProps) {
	const value = readCell(cells, column);
	return (
		<input
			className="db-input"
			data-column-type={column.type}
			aria-label={column.name || "Untitled column"}
			value={typeof value === "string" ? value : ""}
			placeholder={placeholder}
			readOnly={!editable}
			spellCheck={column.type !== "url"}
			type={column.type === "url" ? "url" : "text"}
			// biome-ignore lint/a11y/noAutofocus: a row added from "New row" starts typed into.
			autoFocus={autoFocus}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={finishOnEnter}
		/>
	);
}

/** A number is kept as typed until it reads as a number, then saved. */
function NumberCell({ column, cells, editable, onChange }: CellProps) {
	const value = readCell(cells, column);
	const saved = typeof value === "number" ? String(value) : "";
	const [draft, setDraft] = useState(saved);
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (!focused) setDraft(saved);
	}, [saved, focused]);
	const commit = () => {
		const text = draft.trim();
		if (text === "") return onChange(null);
		const n = Number(text);
		if (Number.isFinite(n)) onChange(n);
		else setDraft(saved);
	};
	return (
		<input
			className="db-input db-number"
			aria-label={column.name || "Untitled column"}
			inputMode="decimal"
			value={draft}
			readOnly={!editable}
			onFocus={() => setFocused(true)}
			onBlur={() => {
				setFocused(false);
				commit();
			}}
			onChange={(e) => setDraft(e.target.value)}
			onKeyDown={finishOnEnter}
		/>
	);
}

function DateCell({ column, cells, editable, onChange }: CellProps) {
	const value = readCell(cells, column);
	return (
		<input
			className="db-input db-date"
			data-empty={
				typeof value === "string" && value !== "" ? undefined : "true"
			}
			aria-label={column.name || "Untitled column"}
			type="date"
			value={typeof value === "string" ? value : ""}
			readOnly={!editable}
			onChange={(e) => onChange(e.target.value || null)}
			onKeyDown={finishOnEnter}
		/>
	);
}

function CheckboxCell({ column, cells, editable, onChange }: CellProps) {
	return (
		<span className="db-check">
			<Checkbox
				aria-label={column.name || "Untitled column"}
				checked={readCell(cells, column) === true}
				disabled={!editable}
				onCheckedChange={(checked) => onChange(checked === true)}
			/>
		</span>
	);
}

export function OptionChip({
	option,
	onRemove,
}: {
	option: SelectOption;
	onRemove?: () => void;
}) {
	return (
		<span
			className="db-option"
			data-tone={option.tone}
			data-status={option.group ?? undefined}
		>
			{option.group && <span className="db-option-dot" aria-hidden="true" />}
			<span className="db-option-name">{option.name || "Untitled"}</span>
			{onRemove && (
				<button
					type="button"
					className="db-option-remove"
					aria-label={`Remove ${option.name}`}
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
				>
					<X aria-hidden="true" />
				</button>
			)}
		</span>
	);
}

/**
 * Select and multi-select: the cell shows the chosen options; clicking opens
 * a picker where typing filters the options and Enter picks the first match
 * or creates a new option with that name.
 */
function OptionsCell({ column, cells, editable, onOptionChange }: CellProps) {
	const multi = column.type === "multiSelect";
	const value = readCell(cells, column);
	const chosen = multi
		? (value as string[])
		: typeof value === "string"
			? [value]
			: [];
	const options = column.options ?? [];
	const byId = new Map(options.map((o) => [o.id, o]));
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const matches = useMemo(() => {
		const q = query.trim().toLowerCase();
		return q === ""
			? options
			: options.filter((o) => o.name.toLowerCase().includes(q));
	}, [options, query]);
	const exact = options.some(
		(o) => o.name.toLowerCase() === query.trim().toLowerCase(),
	);

	const pick = (optionId: string, nextColumn: DbColumn = column) => {
		if (multi) {
			const next = chosen.includes(optionId)
				? chosen.filter((id) => id !== optionId)
				: [...chosen, optionId];
			onOptionChange(nextColumn, next);
		} else {
			onOptionChange(nextColumn, chosen[0] === optionId ? null : optionId);
			setOpen(false);
		}
		setQuery("");
	};
	const create = () => {
		if (query.trim() === "") return;
		const made = ensureOption(column, query);
		pick(made.optionId, made.column);
	};
	const remove = (optionId: string) =>
		onOptionChange(
			column,
			multi ? chosen.filter((id) => id !== optionId) : null,
		);

	const chips = chosen
		.map((id) => byId.get(id))
		.filter((o): o is SelectOption => o !== undefined);

	return (
		<Popover open={editable && open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="db-options-cell"
					aria-label={column.name || "Untitled column"}
					disabled={!editable}
				>
					{chips.map((o) => (
						<OptionChip key={o.id} option={o} />
					))}
				</button>
			</PopoverTrigger>
			<PopoverContent className="db-popover db-option-picker" align="start">
				{chips.length > 0 && (
					<div className="db-option-chosen">
						{chips.map((o) => (
							<OptionChip key={o.id} option={o} onRemove={() => remove(o.id)} />
						))}
					</div>
				)}
				<input
					className="db-picker-input"
					aria-label="Find or create an option"
					placeholder="Find or create an option"
					value={query}
					// biome-ignore lint/a11y/noAutofocus: the picker opens to type in.
					autoFocus
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== "Enter") return;
						e.preventDefault();
						const typed = query.trim().toLowerCase();
						const same = options.find((o) => o.name.toLowerCase() === typed);
						if (typed === "") {
							if (matches[0]) pick(matches[0].id);
						} else if (same) pick(same.id);
						else create();
					}}
				/>
				<div
					className="db-option-list"
					role="listbox"
					aria-multiselectable={multi}
				>
					{(column.type === "status"
						? STATUS_GROUPS.map((group) => ({
								group,
								items: matches.filter((o) => (o.group ?? "todo") === group),
							}))
						: [{ group: null, items: matches }]
					).map(({ group, items }) => (
						<div key={group ?? "all"} className="db-option-group">
							{group && items.length > 0 && (
								<p className="db-menu-heading">{STATUS_GROUP_LABELS[group]}</p>
							)}
							{items.map((o) => (
								<button
									key={o.id}
									type="button"
									role="option"
									aria-selected={chosen.includes(o.id)}
									className="db-option-row"
									onClick={() => pick(o.id)}
								>
									<OptionChip option={o} />
									{chosen.includes(o.id) && (
										<Check className="db-option-check" aria-hidden="true" />
									)}
								</button>
							))}
						</div>
					))}
					{query.trim() !== "" && !exact && (
						<button
							type="button"
							className="db-option-row db-option-create"
							onClick={create}
						>
							Create <strong>{query.trim()}</strong>
						</button>
					)}
					{options.length === 0 && query.trim() === "" && (
						<p className="db-empty-hint">Type to create an option</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Progress: a bar that only stops at 0, 25, 50, 75 and 100 percent. Clicking
 * or dragging along it snaps to the nearest stop, and the arrow keys step
 * between stops.
 */
function ProgressCell({ column, cells, editable, onChange }: CellProps) {
	const value = readCell(cells, column);
	const percent = typeof value === "number" ? value : 0;
	const at = (event: { clientX: number; currentTarget: HTMLElement }) => {
		const box = event.currentTarget.getBoundingClientRect();
		const ratio = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
		return snapProgress(Math.min(1, Math.max(0, ratio)) * 100);
	};
	const set = (next: number) => {
		if (next !== percent) onChange(next === 0 ? null : next);
	};
	const index = PROGRESS_STEPS.indexOf(
		percent as (typeof PROGRESS_STEPS)[number],
	);
	return (
		<div className="db-progress">
			<div
				className="db-progress-track"
				role="slider"
				tabIndex={editable ? 0 : -1}
				aria-label={column.name || "Progress"}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				aria-valuetext={`${percent}%`}
				aria-readonly={!editable}
				data-value={percent}
				onPointerDown={(event) => {
					if (!editable) return;
					event.preventDefault();
					event.currentTarget.setPointerCapture?.(event.pointerId);
					set(at(event));
				}}
				onPointerMove={(event) => {
					if (editable && event.buttons === 1) set(at(event));
				}}
				onKeyDown={(event) => {
					if (!editable) return;
					const step =
						event.key === "ArrowRight" || event.key === "ArrowUp"
							? 1
							: event.key === "ArrowLeft" || event.key === "ArrowDown"
								? -1
								: 0;
					if (step === 0) return;
					event.preventDefault();
					const next =
						PROGRESS_STEPS[
							Math.min(PROGRESS_STEPS.length - 1, Math.max(0, index + step))
						];
					if (next !== undefined) set(next);
				}}
			>
				<span className="db-progress-fill" style={{ width: `${percent}%` }} />
				{PROGRESS_STEPS.slice(1, -1).map((step) => (
					<span
						key={step}
						className="db-progress-tick"
						style={{ left: `${step}%` }}
						aria-hidden="true"
					/>
				))}
			</div>
			<span className="db-progress-label">{percent}%</span>
		</div>
	);
}

export function Cell(props: CellProps) {
	switch (props.column.type) {
		case "title":
		case "text":
		case "url":
			return <TextCell {...props} />;
		case "number":
			return <NumberCell {...props} />;
		case "date":
			return <DateCell {...props} />;
		case "checkbox":
			return <CheckboxCell {...props} />;
		case "select":
		case "multiSelect":
		case "status":
			return <OptionsCell {...props} />;
		case "progress":
			return <ProgressCell {...props} />;
	}
}
