import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { ResourceType } from "../../core/resources/resources";
import { Choice } from "./Choice";
import { plural } from "./resource-utils";

export interface FieldRemoval {
	typeId: string;
	label: string;
	withValue: number;
	alsoValues: boolean;
}

export interface TypeRemoval {
	typeId: string;
	cards: number;
	choice: "none" | "move";
	target: string;
}

/** Asks what happens to a field's values before the field is removed. */
export function FieldRemovalDialog({
	removal,
	types,
	onChange,
	onCancel,
	onConfirm,
}: {
	removal: FieldRemoval | null;
	types: ResourceType[];
	onChange: (next: FieldRemoval) => void;
	onCancel: () => void;
	onConfirm: (removal: FieldRemoval) => void;
}) {
	return (
		<Dialog
			open={removal !== null}
			onOpenChange={(next) => !next && onCancel()}
		>
			<DialogContent className="res-dialog">
				{removal && (
					<>
						<DialogHeader>
							<DialogTitle>
								Remove "{removal.label}" from{" "}
								{types.find((t) => t.id === removal.typeId)?.name}?
							</DialogTitle>
							<DialogDescription>
								{removal.withValue > 0
									? `${plural(removal.withValue, "card")} ${removal.withValue === 1 ? "has" : "have"} a value in this field. Choose what happens to ${removal.withValue === 1 ? "that value" : "those values"}.`
									: "No cards have a value here, so nothing is lost."}
							</DialogDescription>
						</DialogHeader>
						{removal.withValue > 0 && (
							<div
								className="res-choices"
								role="radiogroup"
								aria-label="What happens to the values"
							>
								<Choice
									checked={!removal.alsoValues}
									label="Keep the values as extra properties"
									detail="Each card keeps the value and it stays searchable. Recommended."
									onPick={() => onChange({ ...removal, alsoValues: false })}
								/>
								<Choice
									checked={removal.alsoValues}
									label="Remove the values too"
									detail="A copy of each card goes to the recovery folder first."
									onPick={() => onChange({ ...removal, alsoValues: true })}
								/>
							</div>
						)}
						<DialogFooter>
							<Button variant="outline" onClick={onCancel}>
								Keep the field
							</Button>
							<Button onClick={() => onConfirm(removal)}>Remove field</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Asks where a type's cards go before the type is deleted. */
export function TypeRemovalDialog({
	removal,
	types,
	onChange,
	onCancel,
	onConfirm,
}: {
	removal: TypeRemoval | null;
	types: ResourceType[];
	onChange: (next: TypeRemoval) => void;
	onCancel: () => void;
	onConfirm: (removal: TypeRemoval) => void;
}) {
	return (
		<Dialog
			open={removal !== null}
			onOpenChange={(next) => !next && onCancel()}
		>
			<DialogContent className="res-dialog">
				{removal && (
					<>
						<DialogHeader>
							<DialogTitle>
								Delete the {types.find((t) => t.id === removal.typeId)?.name}{" "}
								type?
							</DialogTitle>
							<DialogDescription>
								{removal.cards > 0
									? `${plural(removal.cards, "card")} use this type. The cards stay either way; choose where they go.`
									: "No cards use this type, so nothing else changes."}
							</DialogDescription>
						</DialogHeader>
						{removal.cards > 0 && (
							<>
								<div
									className="res-choices"
									role="radiogroup"
									aria-label="What happens to the cards"
								>
									<Choice
										checked={removal.choice === "none"}
										label="Keep the cards without a type"
										detail="Every value stays on the card as an extra property. You can give them a type later."
										onPick={() => onChange({ ...removal, choice: "none" })}
									/>
									<Choice
										checked={removal.choice === "move"}
										label="Move the cards to another type"
										detail="Values with a matching field name move across. The rest stay as extra properties."
										onPick={() => onChange({ ...removal, choice: "move" })}
									/>
								</div>
								{removal.choice === "move" && (
									<label className="res-field">
										<span>Move cards to</span>
										<select
											value={removal.target}
											onChange={(event) =>
												onChange({ ...removal, target: event.target.value })
											}
										>
											{types
												.filter((t) => t.id !== removal.typeId)
												.map((t) => (
													<option key={t.id} value={t.id}>
														{t.name}
													</option>
												))}
										</select>
									</label>
								)}
							</>
						)}
						<DialogFooter>
							<Button variant="outline" onClick={onCancel}>
								Keep the type
							</Button>
							<Button
								disabled={
									removal.cards > 0 &&
									removal.choice === "move" &&
									removal.target === ""
								}
								onClick={() => onConfirm(removal)}
							>
								Delete type
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
