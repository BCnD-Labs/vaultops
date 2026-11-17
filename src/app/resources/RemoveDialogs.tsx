import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ResourceType } from "../../core/resources/resources";
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

/** One option card in a removal dialog's radio group. */
function Choice({
	id,
	value,
	label,
	detail,
}: {
	id: string;
	value: string;
	label: string;
	detail: string;
}) {
	return (
		<label className="res-choice" htmlFor={id}>
			<RadioGroupItem id={id} value={value} />
			<span className="res-choice-text">
				<strong>{label}</strong>
				<span className="res-hint">{detail}</span>
			</span>
		</label>
	);
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
							<RadioGroup
								className="res-choices"
								aria-label="What happens to the values"
								value={removal.alsoValues ? "also" : "keep"}
								onValueChange={(v) =>
									onChange({ ...removal, alsoValues: v === "also" })
								}
							>
								<Choice
									id="res-field-keep"
									value="keep"
									label="Keep the values as extra properties"
									detail="Each card keeps the value and it stays searchable. Recommended."
								/>
								<Choice
									id="res-field-also"
									value="also"
									label="Remove the values too"
									detail="A copy of each card goes to the recovery folder first."
								/>
							</RadioGroup>
						)}
						<DialogFooter>
							<Button variant="outline" onClick={onCancel}>
								Keep the field
							</Button>
							<Button variant="destructive" onClick={() => onConfirm(removal)}>
								Remove field
							</Button>
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
								<RadioGroup
									className="res-choices"
									aria-label="What happens to the cards"
									value={removal.choice}
									onValueChange={(v) =>
										onChange({ ...removal, choice: v as TypeRemoval["choice"] })
									}
								>
									<Choice
										id="res-type-none"
										value="none"
										label="Keep the cards without a type"
										detail="Every value stays on the card as an extra property. You can give them a type later."
									/>
									<Choice
										id="res-type-move"
										value="move"
										label="Move the cards to another type"
										detail="Values with a matching field name move across. The rest stay as extra properties."
									/>
								</RadioGroup>
								{removal.choice === "move" && (
									<div className="res-field">
										<span id="res-move-label">Move cards to</span>
										<Select
											value={removal.target}
											onValueChange={(target) =>
												onChange({ ...removal, target })
											}
										>
											<SelectTrigger aria-labelledby="res-move-label">
												<SelectValue placeholder="Choose a type" />
											</SelectTrigger>
											<SelectContent>
												{types
													.filter((t) => t.id !== removal.typeId)
													.map((t) => (
														<SelectItem key={t.id} value={t.id}>
															{t.name}
														</SelectItem>
													))}
											</SelectContent>
										</Select>
									</div>
								)}
							</>
						)}
						<DialogFooter>
							<Button variant="outline" onClick={onCancel}>
								Keep the type
							</Button>
							<Button
								variant="destructive"
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
