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
import type { ResourceField } from "../../core/resources/resources";
import { STARTERS } from "./resource-utils";

export function AddTypeDialog({
	open,
	existing,
	onCancel,
	onCreate,
}: {
	open: boolean;
	existing: string[];
	onCancel: () => void;
	onCreate: (name: string, titleLabel: string, fields: ResourceField[]) => void;
}) {
	const uid = useId();
	const [name, setName] = useState("");
	const [titleLabel, setTitleLabel] = useState("Name");
	const [picked, setPicked] = useState<Set<string>>(new Set(["Notes"]));
	useEffect(() => {
		if (open) {
			setName("");
			setTitleLabel("Name");
			setPicked(new Set(["Notes"]));
		}
	}, [open]);
	const clean = name.trim();
	const duplicate = existing.some(
		(n) => n.toLowerCase() === clean.toLowerCase(),
	);
	const hint =
		clean === ""
			? "Name the type to continue."
			: duplicate
				? `A type called ${clean} already exists.`
				: "";
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
			<DialogContent className="res-dialog">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (hint === "")
							onCreate(
								clean,
								titleLabel.trim() || "Name",
								STARTERS.filter((s) => picked.has(s.label)).map((s) => ({
									label: s.label,
									kind: s.kind,
									required: false,
								})),
							);
					}}
				>
					<DialogHeader>
						<DialogTitle>Add a type</DialogTitle>
						<DialogDescription>
							Start small. You can add or remove fields later without losing any
							values.
						</DialogDescription>
					</DialogHeader>
					<label className="res-field" htmlFor={`${uid}-name`}>
						<span>Type name</span>
						<Input
							id={`${uid}-name`}
							autoFocus
							placeholder="Recipe, Place, Tool"
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</label>
					<label className="res-field" htmlFor={`${uid}-title`}>
						<span>What do you call each card?</span>
						<Input
							id={`${uid}-title`}
							value={titleLabel}
							onChange={(event) => setTitleLabel(event.target.value)}
						/>
						<span className="res-hint">
							This is the only required field to start with.
						</span>
					</label>
					<fieldset className="res-starters">
						<legend>Optional fields to start with</legend>
						{STARTERS.map((s) => (
							<Button
								key={s.label}
								type="button"
								size="sm"
								variant="secondary"
								aria-pressed={picked.has(s.label)}
								onClick={() => {
									const next = new Set(picked);
									if (next.has(s.label)) next.delete(s.label);
									else next.add(s.label);
									setPicked(next);
								}}
							>
								{s.label}
							</Button>
						))}
					</fieldset>
					<DialogFooter>
						<span className="res-hint">{hint}</span>
						<Button type="button" variant="outline" onClick={onCancel}>
							Cancel
						</Button>
						<Button type="submit" disabled={hint !== ""}>
							Create type
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
