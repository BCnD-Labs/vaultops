import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
	ALL_FIELD_KINDS,
	type FieldKind,
	KIND_LABELS,
	type ResourceField,
} from "../../core/resources/resources";

export function AddFieldDialog({
	open,
	typeName,
	existing,
	onCancel,
	onCreate,
}: {
	open: boolean;
	typeName: string;
	existing: string[];
	onCancel: () => void;
	onCreate: (field: ResourceField) => void;
}) {
	const uid = useId();
	const [label, setLabel] = useState("");
	const [kind, setKind] = useState<FieldKind>("text");
	const [required, setRequired] = useState(false);
	const [options, setOptions] = useState("");
	useEffect(() => {
		if (open) {
			setOptions("");
			setLabel("");
			setKind("text");
			setRequired(false);
		}
	}, [open]);
	const clean = label.trim();
	const duplicate = existing.some(
		(n) => n.toLowerCase() === clean.toLowerCase(),
	);
	const hint =
		clean === ""
			? "Name the field to continue."
			: duplicate
				? `${typeName} already has a field called ${clean}.`
				: "";
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
			<DialogContent className="res-dialog">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (hint === "")
							onCreate({
								label: clean,
								kind,
								required,
								...(kind === "select" && {
									options: options
										.split(",")
										.map((o) => o.trim())
										.filter(Boolean),
								}),
							});
					}}
				>
					<DialogHeader>
						<DialogTitle>Add a field to {typeName}</DialogTitle>
						<DialogDescription>
							Existing cards will show it empty. Nothing else changes.
						</DialogDescription>
					</DialogHeader>
					<label className="res-field" htmlFor={`${uid}-label`}>
						<span>Field name</span>
						<Input
							id={`${uid}-label`}
							autoFocus
							placeholder="Phone, Website, Pronouns"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
						/>
					</label>
					<fieldset className="res-starters">
						<legend>Kind</legend>
						{ALL_FIELD_KINDS.map((k) => (
							<Button
								key={k}
								type="button"
								size="sm"
								variant="outline"
								aria-pressed={kind === k}
								onClick={() => setKind(k)}
							>
								{KIND_LABELS[k]}
							</Button>
						))}
					</fieldset>
					{kind === "select" && (
						<label className="res-field" htmlFor={`${uid}-options`}>
							<span>Options, separated by commas</span>
							<Input
								id={`${uid}-options`}
								placeholder="To read, Reading, Done"
								value={options}
								onChange={(event) => setOptions(event.target.value)}
							/>
						</label>
					)}
					<div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							aria-pressed={required}
							onClick={() => setRequired(!required)}
						>
							{required ? "Required" : "Optional"}
						</Button>
						<p className="res-hint">
							Optional is the default. Required blocks saving until it is
							filled.
						</p>
					</div>
					<DialogFooter>
						<span className="res-hint">{hint}</span>
						<Button type="button" variant="outline" onClick={onCancel}>
							Cancel
						</Button>
						<Button type="submit" disabled={hint !== ""}>
							Add field
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
