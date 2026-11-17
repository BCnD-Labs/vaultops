import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Backlink } from "../../core/links/links";
import {
	cardExtras,
	cardFields,
	completeness,
	missingRequired,
	type ResourceCard,
	type ResourceType,
} from "../../core/resources/resources";
import { whenLabel } from "./resource-utils";

/** The shown card (or the "nothing selected" prompt) in the detail pane. */
export function CardDetail({
	card,
	cardType,
	types,
	mentions,
	canWrite,
	onNewCard,
	onEdit,
	onRemove,
	onOpenNote,
	onSetType,
}: {
	card: ResourceCard | null;
	cardType: ResourceType | null;
	types: ResourceType[];
	/** The notes and canvases that link here; null while still looking. */
	mentions: Backlink[] | null;
	canWrite: boolean;
	onNewCard: () => void;
	onEdit: (type: ResourceType, card: ResourceCard) => void;
	onRemove: (card: ResourceCard) => void;
	onOpenNote?: (path: string) => void;
	onSetType: (card: ResourceCard, type: ResourceType) => void;
}) {
	if (!card) {
		return (
			<div className="res-empty">
				<h2>Nothing selected</h2>
				<p className="manager-empty">
					Pick a card from the list, or start a new one. A card only needs its
					name to be saved.
				</p>
				<Button size="sm" disabled={!canWrite} onClick={onNewCard}>
					<Plus aria-hidden="true" /> Start a new card
				</Button>
			</div>
		);
	}
	const fields = cardType ? cardFields(card, cardType) : [];
	const filledFields = fields.filter((f) => f.value.trim() !== "");
	const emptyFields = fields.filter((f) => f.value.trim() === "");
	const extras = cardExtras(card, cardType);
	const lacking = missingRequired(card, cardType);
	const meter = cardType ? completeness(card, cardType) : null;
	return (
		<article aria-label="Resource card" className="res-card">
			<div className="res-card-head">
				<div>
					<p className="res-hint">{cardType ? cardType.name : "No type"}</p>
					<h2>{card.title}</h2>
					<p className="res-hint">
						{card.updated
							? `Updated ${whenLabel(card.updated)}`
							: "Not edited here yet"}
						{meter ? ` · ${meter.filled} of ${meter.total} fields filled` : ""}
					</p>
				</div>
				<div className="res-actions">
					{cardType && !card.problem && (
						<Button
							size="sm"
							variant="outline"
							disabled={!canWrite}
							onClick={() => onEdit(cardType, card)}
						>
							Edit
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						disabled={!canWrite}
						onClick={() => onRemove(card)}
					>
						Remove card
					</Button>
				</div>
			</div>
			{card.problem && (
				<p role="alert" className="res-error">
					{card.problem}
				</p>
			)}
			{filledFields.length > 0 && (
				<dl className="res-values">
					{filledFields.map(({ field, value }) => (
						<div key={field.label}>
							<dt>{field.label}</dt>
							<dd>{value}</dd>
						</div>
					))}
				</dl>
			)}
			{emptyFields.length > 0 && (
				<p className="res-note">
					Empty: {emptyFields.map((f) => f.field.label).join(", ")}
				</p>
			)}
			{lacking.length > 0 && (
				<p className="res-warn">
					Missing a required field: {lacking.join(", ")}. Edit the card to fill
					it in.
				</p>
			)}
			{extras.length > 0 && (
				<div>
					<h3>Extra properties</h3>
					<p className="res-hint">
						Kept from removed fields or types. They stay searchable and nothing
						was deleted.
					</p>
					<dl className="res-values">
						{extras.map((e) => (
							<div key={e.name}>
								<dt>{e.name}</dt>
								<dd>
									{e.value ?? "Kept as it is (this version can't show it)"}
								</dd>
							</div>
						))}
					</dl>
				</div>
			)}
			<div>
				<h3>Mentioned in</h3>
				{mentions === null ? (
					<p className="res-hint">Looking through your notes...</p>
				) : mentions.length === 0 ? (
					<p className="manager-empty">
						No note links here yet. In any note, type @ and pick {card.title}.
					</p>
				) : (
					<ul className="res-mentions">
						{mentions.map((m) => (
							<li key={m.path}>
								<button
									type="button"
									className="res-mention"
									disabled={!onOpenNote}
									onClick={() => onOpenNote?.(m.path)}
								>
									{m.title}
									{m.kind === "canvas" ? " (canvas)" : ""}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
			{!cardType && !card.problem && (
				<div className="res-note">
					<h3>Give this card a type</h3>
					<p className="res-hint">
						Values with a matching field name move into that field. The rest
						stay as extra properties.
					</p>
					<div className="res-chips">
						{types.map((t) => (
							<Button
								key={t.id}
								size="sm"
								variant="outline"
								disabled={!canWrite}
								onClick={() => onSetType(card, t)}
							>
								Make it a {t.name}
							</Button>
						))}
					</div>
				</div>
			)}
		</article>
	);
}
