import { MessageSquareText, Plus, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedInput } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import {
	addItem,
	emptyReflection,
	isChoice,
	MAX_ITEM_LENGTH,
	REFLECTION_ITEMS,
	REFLECTION_KEYS,
	type ReflectionDraft,
	type ReflectionKey,
	reflectionPreview,
	reflectionProblem,
	removeItem,
	setItem,
	unchanged,
} from "../../core/planner/reflection";

/**
 * A plain "Reflect" button on a closed task (never a modal, never forced).
 * It opens an inline editor where the user adds only the items they want.
 */
export function ReflectionSection({
	reflectedAt,
	writable,
	load,
	save,
	startOpen = false,
	onStarted,
}: {
	reflectedAt?: string;
	writable: boolean;
	load: () => Promise<ReflectionDraft>;
	save: (d: ReflectionDraft) => Promise<void>;
	/** Open the editor right away (the "Reflect" offer after closing a task). */
	startOpen?: boolean;
	/** Called once the request to open was taken, so it is not repeated. */
	onStarted?: () => void;
}) {
	const [stored, setStored] = useState<ReflectionDraft | null>(null);
	const [draft, setDraft] = useState<ReflectionDraft>(emptyReflection());
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const notesId = useId();

	const begin = async () => {
		setBusy(true);
		setError(null);
		try {
			const d = await load();
			setStored(d);
			setDraft(d);
			setOpen(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once per request to open
	useEffect(() => {
		if (!startOpen) return;
		onStarted?.();
		if (writable && !open) void begin();
	}, [startOpen]);
	const commit = async () => {
		setBusy(true);
		setError(null);
		try {
			await save(draft);
			setOpen(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};

	if (!open) {
		return (
			<div className="plan-reflect">
				{reflectedAt && stored && (
					<p className="plan-meta">{reflectionPreview(stored)}</p>
				)}
				<Button
					variant="ghost"
					size="sm"
					disabled={!writable || busy}
					onClick={() => void begin()}
				>
					<MessageSquareText />
					{reflectedAt ? "Edit reflection" : "Reflect"}
				</Button>
				{error && (
					<p className="plan-error" role="alert">
						{error}
					</p>
				)}
			</div>
		);
	}

	const problem = reflectionProblem(draft);
	const same = stored ? unchanged(draft, stored) : true;
	const missing = REFLECTION_KEYS.filter((k) => !(k in draft.items));
	return (
		<section className="plan-reflect is-open" aria-label="Reflection">
			<h3 className="plan-reflect-title">Reflection</h3>
			{REFLECTION_KEYS.filter((k) => k in draft.items).map((key) => (
				<ItemRow
					key={key}
					itemKey={key}
					value={draft.items[key] ?? ""}
					onChange={(v) => setDraft(setItem(draft, key, v))}
					onRemove={() => setDraft(removeItem(draft, key))}
				/>
			))}
			{missing.length > 0 && (
				<div className="plan-reflect-add">
					{missing.map((key) => (
						<Button
							key={key}
							variant="outline"
							size="sm"
							onClick={() => setDraft(addItem(draft, key))}
						>
							<Plus />
							{REFLECTION_ITEMS[key].label}
						</Button>
					))}
				</div>
			)}
			<div className="plan-field">
				<label htmlFor={notesId}>Notes</label>
				<Textarea
					id={notesId}
					value={draft.notes}
					onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
				/>
			</div>
			{(problem || error) && (
				<p className="plan-error" role="alert">
					{problem ?? error}
				</p>
			)}
			<div className="plan-reflect-actions">
				<Button
					size="sm"
					disabled={busy || same || !!problem}
					onClick={() => void commit()}
				>
					Save reflection
				</Button>
				<Button
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={() => {
						setOpen(false);
						setError(null);
					}}
				>
					Cancel
				</Button>
			</div>
		</section>
	);
}

function ItemRow({
	itemKey,
	value,
	onChange,
	onRemove,
}: {
	itemKey: ReflectionKey;
	value: string;
	onChange: (v: string) => void;
	onRemove: () => void;
}) {
	const id = useId();
	const item = REFLECTION_ITEMS[itemKey];
	const options: readonly string[] = item.options;
	// A stored value that is not one of the choices stays visible and pickable.
	const shown =
		value && !options.includes(value) ? [...options, value] : options;
	return (
		<div className="plan-reflect-item">
			<div className="plan-reflect-item-head">
				<label htmlFor={id}>{item.label}</label>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Remove ${item.label}`}
					onClick={onRemove}
				>
					<X />
				</Button>
			</div>
			{isChoice(itemKey) ? (
				<div id={id}>
					<SegmentedInput
						label={item.label}
						options={shown.map((o) => ({ value: o, label: o }))}
						value={value || null}
						onChange={(v) => onChange(v ?? "")}
					/>
				</div>
			) : (
				<Input
					id={id}
					value={value}
					maxLength={MAX_ITEM_LENGTH}
					onChange={(e) => onChange(e.target.value)}
				/>
			)}
		</div>
	);
}
