import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	KIND_LABELS,
	type ResourceField,
	type ResourceType,
} from "../../core/resources/resources";
import { plural } from "./resource-utils";

/** Fields, required/optional toggles and delete for the type being filtered. */
export function TypeSettings({
	type,
	used,
	canWrite,
	onToggleRequired,
	onRemoveField,
	onAddField,
	onDone,
	onDeleteType,
}: {
	type: ResourceType;
	/** How many cards use this type. */
	used: number;
	canWrite: boolean;
	onToggleRequired: (field: ResourceField) => void;
	onRemoveField: (field: ResourceField) => void;
	onAddField: () => void;
	onDone: () => void;
	onDeleteType: () => void;
}) {
	return (
		<div className="res-settings">
			<div>
				<h2>{type.name} type</h2>
				<p className="res-hint">
					{plural(used, "card")} use this type. Changes here never delete a
					value without asking.
				</p>
			</div>
			<div className="res-setting-row">
				<span>
					<strong>{type.titleLabel}</strong>{" "}
					<span className="res-hint">· name of the card, always required</span>
				</span>
				<span className="res-hint">Fixed</span>
			</div>
			{type.fields.map((f) => (
				<div className="res-setting-row" key={f.label}>
					<span>
						<strong>{f.label}</strong>{" "}
						<span className="res-hint">· {KIND_LABELS[f.kind]}</span>
					</span>
					<Button
						size="sm"
						variant={f.required ? "default" : "outline"}
						aria-pressed={f.required}
						aria-label={`${f.label} is ${f.required ? "required" : "optional"}`}
						disabled={!canWrite}
						onClick={() => onToggleRequired(f)}
					>
						{f.required ? "Required" : "Optional"}
					</Button>
					<Button
						size="sm"
						variant="outline"
						aria-label={`Remove ${f.label}`}
						disabled={!canWrite}
						onClick={() => onRemoveField(f)}
					>
						Remove
					</Button>
				</div>
			))}
			<div className="res-actions">
				<Button size="sm" disabled={!canWrite} onClick={onAddField}>
					<Plus aria-hidden="true" /> Add field
				</Button>
				<Button size="sm" variant="outline" onClick={onDone}>
					Done
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="res-danger"
					disabled={!canWrite}
					onClick={onDeleteType}
				>
					Delete type
				</Button>
			</div>
		</div>
	);
}
