import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkProblem } from "../../core/resources/link";
import type { ResourceType } from "../../core/resources/resources";
import { FieldInput } from "./FieldInput";
import { type FormState, plural } from "./resource-utils";

/** The create/edit form for one card. The parent owns the form state. */
export function CardForm({
	form,
	type,
	idBase,
	formError,
	onChange,
	onSave,
	onCancel,
}: {
	form: FormState;
	type: ResourceType;
	idBase: string;
	formError: string | null;
	onChange: (next: FormState) => void;
	onSave: () => void;
	onCancel: () => void;
}) {
	const missing: string[] = [];
	if (form.title.trim() === "") missing.push(type.titleLabel);
	for (const f of type.fields) {
		if (f.required && (form.values[f.label] ?? "").trim() === "") {
			missing.push(f.label);
		}
	}

	// Link fields whose text is not a usable link; the form can't be saved until fixed.
	const badLinks = type.fields.filter(
		(f) => f.kind === "link" && linkProblem(form.values[f.label] ?? ""),
	);

	const shown = type.fields.filter(
		(f) =>
			f.required || form.showMore || (form.values[f.label] ?? "").trim() !== "",
	);
	const hidden = type.fields.length - shown.length;
	const filledCount =
		(form.title.trim() === "" ? 0 : 1) +
		type.fields.filter((f) => (form.values[f.label] ?? "").trim() !== "")
			.length;
	return (
		<form
			className="res-form"
			onSubmit={(event) => {
				event.preventDefault();
				if (missing.length === 0 && badLinks.length === 0) onSave();
			}}
		>
			<div>
				<h2>
					{form.path ? "Edit" : "New"} {type.name}
				</h2>
				<p className="res-hint">
					{form.path
						? ""
						: `Only the ${type.titleLabel.toLowerCase()} is required. `}
					{filledCount} of {1 + type.fields.length} fields filled.
				</p>
			</div>
			<label className="res-field" htmlFor={`${idBase}-title`}>
				<span>
					{type.titleLabel} <em>Required</em>
				</span>
				<Input
					id={`${idBase}-title`}
					autoFocus
					value={form.title}
					onChange={(event) => onChange({ ...form, title: event.target.value })}
				/>
			</label>
			{shown.map((f) => (
				<FieldInput
					key={f.label}
					id={`${idBase}-${f.label}`}
					field={f}
					value={form.values[f.label] ?? ""}
					onChange={(value) =>
						onChange({ ...form, values: { ...form.values, [f.label]: value } })
					}
				/>
			))}
			{hidden > 0 && (
				<div>
					<Button
						type="button"
						size="sm"
						variant="secondary"
						className="h-auto min-h-[var(--control-height-sm)] whitespace-normal"
						onClick={() => onChange({ ...form, showMore: true })}
					>
						Add more details ({plural(hidden, "more field")})
					</Button>
				</div>
			)}
			{formError && (
				<p role="alert" className="res-error">
					{formError}
				</p>
			)}
			<div className="res-actions">
				<Button
					type="submit"
					disabled={missing.length > 0 || badLinks.length > 0}
				>
					{form.path ? "Save changes" : "Save card"}
				</Button>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<span className="res-hint">
					{missing.length > 0
						? `Needs: ${missing.join(", ")}.`
						: "Saved cards stay out of the Notes tree."}
				</span>
			</div>
		</form>
	);
}
