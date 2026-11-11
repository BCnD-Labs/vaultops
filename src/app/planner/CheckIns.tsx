import { Check } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScaleInput } from "@/components/ui/segmented";
import type { Note } from "../../core/note-format";
import {
	CHECK_IN_SLOTS,
	type CheckInConfig,
	type CheckInDraft,
	type CheckInSlot,
	checkInPreview,
	checkInProblem,
	emptyCheckIn,
	MAX_NOTE_LENGTH,
	prominentSlot,
	readCheckIn,
	SCALE_FIELD_KEYS,
	SCALE_FIELDS,
	SLOT_LABEL,
	setScale,
	unchanged,
} from "../../core/planner/check-in";

/**
 * Quick check-ins on the daily log: one button per enabled slot (morning,
 * afternoon, evening) on a single row. A slot with an entry turns green with a
 * check; the slot that fits the time of day on today's log gets a ring. Click
 * a slot to open its form under the row, and again to close it.
 */
export function CheckIns({
	config,
	note,
	day,
	isToday,
	now,
	writable,
	onSave,
}: {
	config: CheckInConfig;
	note: Note | null;
	day: string;
	isToday: boolean;
	now: Date;
	writable: boolean;
	onSave: (
		day: string,
		slot: CheckInSlot,
		draft: CheckInDraft,
	) => Promise<void>;
}) {
	const [open, setOpen] = useState<CheckInSlot | null>(null);
	const slots = CHECK_IN_SLOTS.filter((s) => config.enabled[s]);
	if (slots.length === 0) return null;
	const current = prominentSlot(config, now, isToday);
	const stored = (slot: CheckInSlot) =>
		note ? readCheckIn(note, slot) : emptyCheckIn();
	const shown = open && slots.includes(open) ? open : null;
	return (
		<fieldset className="plan-checkins" aria-label="Check-ins">
			<div className="plan-checkin-slots">
				{slots.map((slot) => {
					const preview = checkInPreview(stored(slot));
					const isCurrent = slot === current;
					return (
						<button
							key={slot}
							type="button"
							className="plan-checkin-slot"
							aria-label={`${SLOT_LABEL[slot]} check-in`}
							aria-expanded={shown === slot}
							aria-description={
								[isCurrent && "now", preview || "not done"]
									.filter(Boolean)
									.join(", ") || undefined
							}
							title={preview || (isCurrent ? "Now" : "Not done")}
							data-done={preview ? true : undefined}
							data-current={isCurrent || undefined}
							onClick={() => setOpen(shown === slot ? null : slot)}
						>
							{preview && <Check aria-hidden="true" />}
							{SLOT_LABEL[slot]}
						</button>
					);
				})}
			</div>
			{shown && (
				// Reset the draft when the day, the slot or the stored values change.
				<Editor
					key={`${day}:${shown}:${JSON.stringify(stored(shown))}`}
					slot={shown}
					stored={stored(shown)}
					writable={writable}
					onSave={(d) => onSave(day, shown, d)}
				/>
			)}
		</fieldset>
	);
}

function Editor({
	slot,
	stored,
	writable,
	onSave,
}: {
	slot: CheckInSlot;
	stored: CheckInDraft;
	writable: boolean;
	onSave: (d: CheckInDraft) => Promise<void>;
}) {
	const [draft, setDraft] = useState<CheckInDraft>(stored);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const noteId = useId();
	const problem = checkInProblem(draft);
	const same = unchanged(draft, stored);
	const save = async () => {
		setBusy(true);
		setError(null);
		try {
			await onSave(draft);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="plan-checkin-body">
			{SCALE_FIELD_KEYS.map((f) => (
				<div key={f} className="plan-checkin-row">
					<span className="plan-checkin-label">{SCALE_FIELDS[f].label}</span>
					<ScaleInput
						label={`${SLOT_LABEL[slot]} ${SCALE_FIELDS[f].label.toLowerCase()}`}
						value={draft.scales[f] ?? null}
						onChange={(v) => setDraft(setScale(draft, f, v))}
						lowLabel={SCALE_FIELDS[f].low}
						highLabel={SCALE_FIELDS[f].high}
						disabled={!writable}
					/>
				</div>
			))}
			<div className="plan-checkin-row">
				<label className="plan-checkin-label" htmlFor={noteId}>
					Note
				</label>
				<Input
					id={noteId}
					placeholder="Optional, one line"
					value={draft.note}
					maxLength={MAX_NOTE_LENGTH + 50}
					disabled={!writable}
					onChange={(e) => setDraft({ ...draft, note: e.target.value })}
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
					disabled={!writable || busy || same || !!problem}
					onClick={() => void save()}
				>
					Save {SLOT_LABEL[slot].toLowerCase()} check-in
				</Button>
			</div>
		</div>
	);
}
