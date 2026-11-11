import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
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
import { type Backlink, backlinks } from "../core/links/links";
import { linkProblem } from "../core/resources/link";
import {
	addField,
	addType,
	type CardResult,
	cardExtras,
	cardFields,
	completeness,
	countValues,
	createCard,
	deleteType,
	FIELD_KINDS,
	type FieldKind,
	KIND_LABELS,
	listCards,
	loadTypes,
	missingRequired,
	type ResourceCard,
	type ResourceField,
	type ResourceType,
	removeCard,
	removeField,
	searchCards,
	setCardType,
	setFieldRequired,
	updateCard,
} from "../core/resources/resources";
import type { Host } from "../host/host";
import { ConfirmDialog } from "./TemplateDialogs";
import "./resources.css";

type Mode = "view" | "pick" | "form" | "settings";

interface FormState {
	typeId: string;
	/** The card being edited, or null for a new one. */
	path: string | null;
	title: string;
	values: Record<string, string>;
	showMore: boolean;
	/** The form as it was opened, to tell whether anything changed. */
	original: string;
}

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const STARTERS: { label: string; kind: FieldKind }[] = [
	{ label: "Notes", kind: "long" },
	{ label: "Date", kind: "date" },
	{ label: "Link", kind: "link" },
	{ label: "Source", kind: "text" },
];

function whenLabel(iso: string, now = Date.now()): string {
	const t = Date.parse(iso);
	if (Number.isNaN(t)) return "";
	const days = Math.floor((now - t) / 86_400_000);
	if (days <= 0) return "today";
	if (days === 1) return "yesterday";
	if (days < 7) return `${days} days ago`;
	return `${Math.round(days / 7)} wk ago`;
}

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** The first couple of short values, for the card list. */
function subtitle(card: ResourceCard, type: ResourceType | null): string {
	const bits: string[] = [];
	if (type) {
		for (const { field, value } of cardFields(card, type)) {
			if (field.kind !== "long" && value.trim() !== "" && bits.length < 2) {
				bits.push(value);
			}
		}
	} else {
		for (const extra of cardExtras(card, null)) {
			if (extra.value && bits.length < 2) bits.push(extra.value);
		}
	}
	return bits.length > 0 ? bits.join(" · ") : "Only a name so far";
}

/**
 * The resource manager: contacts, books, articles and anything you define,
 * kept apart from the Notes tree. Types and cards on the left, one card on
 * the right. A card needs only its name; the rest is optional unless you make
 * a field required. Removing a field or a type never drops a value without
 * asking, and anything removed goes to the recovery folder, not into thin air.
 */
export function ResourceManager({
	host,
	writable,
	open,
	onClose,
	focusId = null,
	onOpenNote,
}: {
	host: Host;
	writable: boolean;
	open: boolean;
	onClose: () => void;
	/** The `noteId` of a card to show when the manager opens (from a link). */
	focusId?: string | null;
	/** Open a note or canvas that mentions the shown card. */
	onOpenNote?: (path: string) => void;
}) {
	const [types, setTypes] = useState<ResourceType[]>([]);
	const [cards, setCards] = useState<ResourceCard[]>([]);
	const [loaded, setLoaded] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [filter, setFilter] = useState("all");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [mode, setMode] = useState<Mode>("view");
	const [form, setForm] = useState<FormState | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [discard, setDiscard] = useState<(() => void) | null>(null);
	const [removingCard, setRemovingCard] = useState<ResourceCard | null>(null);
	const [typeDialog, setTypeDialog] = useState(false);
	const [fieldDialog, setFieldDialog] = useState<string | null>(null);
	const [fieldRemoval, setFieldRemoval] = useState<{
		typeId: string;
		label: string;
		withValue: number;
		alsoValues: boolean;
	} | null>(null);
	const [typeRemoval, setTypeRemoval] = useState<{
		typeId: string;
		cards: number;
		choice: "none" | "move";
		target: string;
	} | null>(null);

	const refresh = useCallback(async () => {
		try {
			const [nextTypes, nextCards] = await Promise.all([
				loadTypes(host),
				listCards(host),
			]);
			setTypes(nextTypes);
			setCards(nextCards);
			setLoadError(null);
			setLoaded(true);
			return { types: nextTypes, cards: nextCards };
		} catch (error) {
			setLoadError(messageOf(error));
			setLoaded(true);
			return null;
		}
	}, [host]);

	useEffect(() => {
		if (!open) return;
		setMessage(null);
		setMode("view");
		setForm(null);
		void refresh();
	}, [open, refresh]);

	// A link in a note opens the manager on its card.
	useEffect(() => {
		if (!open || !loaded || !focusId) return;
		const target = cards.find((c) => c.noteId === focusId);
		if (!target) return;
		setFilter("all");
		setQuery("");
		setSelected(target.path);
		setMode("view");
	}, [open, loaded, focusId, cards]);

	// The notes and canvases that link to the shown card.
	const shownId = cards.find((c) => c.path === selected)?.noteId ?? null;
	const [mentions, setMentions] = useState<Backlink[] | null>(null);
	useEffect(() => {
		setMentions(null);
		if (!open || !shownId) return;
		let current = true;
		backlinks(host, shownId)
			.then((found) => current && setMentions(found))
			.catch(() => current && setMentions([]));
		return () => {
			current = false;
		};
	}, [open, shownId, host]);

	const typeOf = (card: ResourceCard) =>
		types.find((t) => t.id === card.typeId) ?? null;
	const untyped = cards.filter((c) => typeOf(c) === null);
	const inFilter = (() => {
		if (filter === "all") return cards;
		if (filter === "recent") {
			return cards
				.filter((c) => c.updated !== "")
				.sort((a, b) => b.updated.localeCompare(a.updated))
				.slice(0, 8);
		}
		if (filter === "none") return untyped;
		return cards.filter((c) => c.typeId === filter);
	})();
	const rows = searchCards(inFilter, query);
	const card = cards.find((c) => c.path === selected) ?? null;
	const cardType = card ? typeOf(card) : null;
	const filterType = types.find((t) => t.id === filter) ?? null;
	const readOnlyReason = loadError !== null;
	const canWrite = writable && !readOnlyReason;

	const dirty =
		form !== null &&
		JSON.stringify({ t: form.title, v: form.values }) !== form.original;
	const guard = (action: () => void) => {
		if (mode === "form" && dirty) setDiscard(() => action);
		else action();
	};

	const startForm = (type: ResourceType, existing: ResourceCard | null) => {
		const values: Record<string, string> = {};
		if (existing) {
			for (const f of cardFields(existing, type))
				values[f.field.label] = f.value;
		}
		const title = existing?.title ?? "";
		setForm({
			typeId: type.id,
			path: existing?.path ?? null,
			title,
			values,
			showMore: existing !== null,
			original: JSON.stringify({ t: title, v: values }),
		});
		setFormError(null);
		setMessage(null);
		setMode("form");
	};

	const finish = async (
		result: CardResult,
		text: (title: string) => string,
	) => {
		if (!result.ok) {
			setFormError(result.message);
			return;
		}
		const next = await refresh();
		const saved = next?.cards.find((c) => c.path === result.path);
		setSelected(result.path);
		setForm(null);
		setMode("view");
		setMessage(text(saved?.title ?? ""));
	};

	const run = async (work: () => Promise<void>) => {
		try {
			await work();
		} catch (error) {
			setMessage(messageOf(error));
		}
	};

	const save = () =>
		run(async () => {
			if (!form) return;
			const type = types.find((t) => t.id === form.typeId);
			if (!type) return;
			if (form.path) {
				await finish(
					await updateCard(host, form.path, type, form.title, form.values),
					(t) => `Saved changes to "${t}".`,
				);
			} else {
				const result = await createCard(host, type, form.title, form.values);
				if (result.ok && filter !== "all" && filter !== "recent")
					setFilter(type.id);
				await finish(
					result,
					(t) => `Saved "${t}". It lives in Resources, not in the Notes tree.`,
				);
			}
		});

	const pickCard = (path: string) =>
		guard(() => {
			setSelected(path);
			setMode("view");
			setForm(null);
			setMessage(null);
		});
	const pickFilter = (next: string) =>
		guard(() => {
			setFilter(next);
			setMode("view");
			setForm(null);
			setMessage(null);
		});

	const missing = form
		? (() => {
				const type = types.find((t) => t.id === form.typeId);
				if (!type) return [];
				const out: string[] = [];
				if (form.title.trim() === "") out.push(type.titleLabel);
				for (const f of type.fields) {
					if (f.required && (form.values[f.label] ?? "").trim() === "") {
						out.push(f.label);
					}
				}
				return out;
			})()
		: [];

	// Link fields whose text is not a usable link; the form can't be saved until fixed.
	const badLinks = form
		? (types.find((t) => t.id === form.typeId)?.fields ?? []).filter(
				(f) => f.kind === "link" && linkProblem(form.values[f.label] ?? ""),
			)
		: [];

	const idBase = useId();

	const renderForm = () => {
		if (!form) return null;
		const type = types.find((t) => t.id === form.typeId);
		if (!type) return null;
		const shown = type.fields.filter(
			(f) =>
				f.required ||
				form.showMore ||
				(form.values[f.label] ?? "").trim() !== "",
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
					if (missing.length === 0 && badLinks.length === 0) void save();
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
						onChange={(event) =>
							setForm({ ...form, title: event.target.value })
						}
					/>
				</label>
				{shown.map((f) => (
					<FieldInput
						key={f.label}
						id={`${idBase}-${f.label}`}
						field={f}
						value={form.values[f.label] ?? ""}
						onChange={(value) =>
							setForm({ ...form, values: { ...form.values, [f.label]: value } })
						}
					/>
				))}
				{hidden > 0 && (
					<div>
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => setForm({ ...form, showMore: true })}
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
						size="sm"
						disabled={missing.length > 0 || badLinks.length > 0}
					>
						{form.path ? "Save changes" : "Save card"}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() =>
							guard(() => {
								setForm(null);
								setMode("view");
							})
						}
					>
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
	};

	const renderCard = () => {
		if (!card) {
			return (
				<div className="res-empty">
					<h2>Nothing selected</h2>
					<p className="res-hint">
						Pick a card from the list, or start a new one. A card only needs its
						name to be saved.
					</p>
					<Button
						size="sm"
						disabled={!canWrite}
						onClick={() => setMode("pick")}
					>
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
							{meter
								? ` · ${meter.filled} of ${meter.total} fields filled`
								: ""}
						</p>
					</div>
					<div className="res-actions">
						{cardType && !card.problem && (
							<Button
								size="sm"
								variant="outline"
								disabled={!canWrite}
								onClick={() => startForm(cardType, card)}
							>
								Edit
							</Button>
						)}
						<Button
							size="sm"
							variant="outline"
							disabled={!canWrite}
							onClick={() => setRemovingCard(card)}
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
						Missing a required field: {lacking.join(", ")}. Edit the card to
						fill it in.
					</p>
				)}
				{extras.length > 0 && (
					<div>
						<h3>Extra properties</h3>
						<p className="res-hint">
							Kept from removed fields or types. They stay searchable and
							nothing was deleted.
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
						<p className="res-hint">
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
									onClick={() =>
										void run(async () => {
											await setCardType(host, card.path, t.id);
											await refresh();
											setMessage(`"${card.title}" is now a ${t.name}.`);
										})
									}
								>
									Make it a {t.name}
								</Button>
							))}
						</div>
					</div>
				)}
			</article>
		);
	};

	const renderSettings = () => {
		const type = filterType;
		if (!type) return null;
		const used = cards.filter((c) => c.typeId === type.id).length;
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
						<span className="res-hint">
							· name of the card, always required
						</span>
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
							onClick={() =>
								void run(async () => {
									await setFieldRequired(host, type.id, f.label, !f.required);
									await refresh();
									setMessage(
										f.required
											? `"${f.label}" is optional again.`
											: `"${f.label}" is now required for new and edited ${type.name} cards. Cards already saved without it are left as they are and flagged.`,
									);
								})
							}
						>
							{f.required ? "Required" : "Optional"}
						</Button>
						<Button
							size="sm"
							variant="outline"
							aria-label={`Remove ${f.label}`}
							disabled={!canWrite}
							onClick={() =>
								void run(async () => {
									const counts = await countValues(host, type.id, f.label);
									setFieldRemoval({
										typeId: type.id,
										label: f.label,
										withValue: counts.withValue,
										alsoValues: false,
									});
								})
							}
						>
							Remove
						</Button>
					</div>
				))}
				<div className="res-actions">
					<Button
						size="sm"
						disabled={!canWrite}
						onClick={() => setFieldDialog(type.id)}
					>
						<Plus aria-hidden="true" /> Add field
					</Button>
					<Button size="sm" variant="outline" onClick={() => setMode("view")}>
						Done
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="res-danger"
						disabled={!canWrite}
						onClick={() => {
							const others = types.filter((t) => t.id !== type.id);
							setTypeRemoval({
								typeId: type.id,
								cards: used,
								choice: "none",
								target: others[0]?.id ?? "",
							});
						}}
					>
						Delete type
					</Button>
				</div>
			</div>
		);
	};

	const detail = () => {
		if (mode === "pick") {
			return (
				<div className="res-pick">
					<div>
						<h2>What are you adding?</h2>
						<p className="res-hint">
							Each type asks for as little as possible. You can add detail
							later.
						</p>
					</div>
					<div className="res-pick-grid">
						{types.map((t) => (
							<button
								key={t.id}
								type="button"
								className="res-pick-tile"
								onClick={() => startForm(t, null)}
							>
								<strong>{t.name}</strong>
								<span className="res-hint">
									Needs only a {t.titleLabel.toLowerCase()}
								</span>
								<span className="res-hint">
									{plural(t.fields.length, "optional field")}
								</span>
							</button>
						))}
						<button
							type="button"
							className="res-pick-tile res-pick-add"
							onClick={() => setTypeDialog(true)}
						>
							+ Add type
						</button>
					</div>
					<div>
						<Button size="sm" variant="outline" onClick={() => setMode("view")}>
							Cancel
						</Button>
					</div>
				</div>
			);
		}
		if (mode === "form") return renderForm();
		if (mode === "settings") return renderSettings();
		return renderCard();
	};

	return (
		<>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!next) guard(onClose);
				}}
			>
				<DialogContent
					className="res-manager"
					lightOverlay
					aria-describedby="res-manager-about"
				>
					<DialogTitle>Resource manager</DialogTitle>
					<DialogDescription id="res-manager-about" className="sr-only">
						Contacts, books, articles and your own kinds of resource, kept apart
						from your notes.
					</DialogDescription>
					<div className="res-toolbar">
						<Input
							aria-label="Search resources"
							placeholder="Search names, emails, authors, extra properties"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<Button
							size="sm"
							disabled={!canWrite}
							onClick={() => guard(() => setMode("pick"))}
						>
							<Plus aria-hidden="true" /> New resource
						</Button>
						<span className="res-hint">Cards are not notes.</span>
					</div>
					{!writable && (
						<p className="res-note">
							This vault is read-only, so resources can only be viewed.
						</p>
					)}
					{loadError && (
						<p role="alert" className="res-error">
							{loadError}
						</p>
					)}
					{message && (
						<p role="status" className="res-status">
							{message}
						</p>
					)}
					<div className="res-body">
						<nav aria-label="Resource types" className="res-types">
							<TypeRow
								label="All"
								count={cards.length}
								active={filter === "all"}
								onClick={() => pickFilter("all")}
							/>
							<TypeRow
								label="Recent"
								count={Math.min(
									8,
									cards.filter((c) => c.updated !== "").length,
								)}
								active={filter === "recent"}
								onClick={() => pickFilter("recent")}
							/>
							{types.map((t) => (
								<TypeRow
									key={t.id}
									label={t.name}
									count={cards.filter((c) => c.typeId === t.id).length}
									active={filter === t.id}
									onClick={() => pickFilter(t.id)}
								/>
							))}
							{untyped.length > 0 && (
								<TypeRow
									label="No type"
									count={untyped.length}
									active={filter === "none"}
									onClick={() => pickFilter("none")}
								/>
							)}
							<button
								type="button"
								className="res-row res-add"
								disabled={!canWrite}
								onClick={() => setTypeDialog(true)}
							>
								+ Add type
							</button>
						</nav>
						<section aria-label="Cards" className="res-list">
							<div className="res-list-head">
								<h2>
									{query.trim()
										? "Results"
										: (filterType?.name ?? labelOf(filter))}
								</h2>
								<span className="res-hint">{plural(rows.length, "card")}</span>
							</div>
							{filterType && (
								<div>
									<Button
										size="sm"
										variant="outline"
										onClick={() => guard(() => setMode("settings"))}
									>
										Edit type and fields
									</Button>
								</div>
							)}
							<ul className="res-rows">
								{rows.map((c) => {
									const t = typeOf(c);
									const meter = t ? completeness(c, t) : null;
									return (
										<li key={c.path}>
											<button
												type="button"
												className="res-row res-card-row"
												aria-current={selected === c.path ? "true" : undefined}
												onClick={() => pickCard(c.path)}
											>
												<span className="res-tile" aria-hidden="true">
													{t ? t.name.charAt(0).toUpperCase() : "–"}
												</span>
												<span className="res-card-text">
													<strong>{c.title}</strong>
													<span className="res-hint">{subtitle(c, t)}</span>
												</span>
												<span className="res-hint res-meter">
													{meter
														? `${meter.filled} of ${meter.total}`
														: "No type"}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
							{loaded && rows.length === 0 && (
								<p className="res-note">
									{query.trim()
										? `No cards match "${query.trim()}". Try fewer words, or search All.`
										: "No cards here yet."}
								</p>
							)}
						</section>
						<section aria-label="Detail" className="res-detail">
							{detail()}
						</section>
					</div>
				</DialogContent>
			</Dialog>

			<AddTypeDialog
				open={typeDialog}
				existing={types.map((t) => t.name)}
				onCancel={() => setTypeDialog(false)}
				onCreate={(name, titleLabel, fields) =>
					void run(async () => {
						const result = await addType(host, { name, titleLabel, fields });
						if (!result.ok) {
							setMessage(result.message);
							return;
						}
						setTypeDialog(false);
						const next = await refresh();
						const made = next?.types.find((t) => t.id === result.id);
						if (made) {
							setFilter(made.id);
							startForm(made, null);
							setMessage(
								`Added the ${made.name} type. A card needs only a ${made.titleLabel.toLowerCase()}.`,
							);
						}
					})
				}
			/>

			<AddFieldDialog
				typeName={types.find((t) => t.id === fieldDialog)?.name ?? ""}
				open={fieldDialog !== null}
				existing={
					types.find((t) => t.id === fieldDialog)
						? [
								types.find((t) => t.id === fieldDialog)?.titleLabel ?? "",
								...(types
									.find((t) => t.id === fieldDialog)
									?.fields.map((f) => f.label) ?? []),
							]
						: []
				}
				onCancel={() => setFieldDialog(null)}
				onCreate={(field) =>
					void run(async () => {
						if (!fieldDialog) return;
						const result = await addField(host, fieldDialog, field);
						if (!result.ok) {
							setMessage(result.message);
							return;
						}
						const used = cards.filter((c) => c.typeId === fieldDialog).length;
						const name = types.find((t) => t.id === fieldDialog)?.name ?? "";
						setFieldDialog(null);
						await refresh();
						setMessage(
							`Added "${field.label}" to ${name}. ${plural(used, "card")} now show it empty; nothing else changed.`,
						);
					})
				}
			/>

			<Dialog
				open={fieldRemoval !== null}
				onOpenChange={(next) => !next && setFieldRemoval(null)}
			>
				<DialogContent className="res-dialog">
					{fieldRemoval && (
						<>
							<DialogHeader>
								<DialogTitle>
									Remove "{fieldRemoval.label}" from{" "}
									{types.find((t) => t.id === fieldRemoval.typeId)?.name}?
								</DialogTitle>
								<DialogDescription>
									{fieldRemoval.withValue > 0
										? `${plural(fieldRemoval.withValue, "card")} ${fieldRemoval.withValue === 1 ? "has" : "have"} a value in this field. Choose what happens to ${fieldRemoval.withValue === 1 ? "that value" : "those values"}.`
										: "No cards have a value here, so nothing is lost."}
								</DialogDescription>
							</DialogHeader>
							{fieldRemoval.withValue > 0 && (
								<div
									className="res-choices"
									role="radiogroup"
									aria-label="What happens to the values"
								>
									<Choice
										checked={!fieldRemoval.alsoValues}
										label="Keep the values as extra properties"
										detail="Each card keeps the value and it stays searchable. Recommended."
										onPick={() =>
											setFieldRemoval({ ...fieldRemoval, alsoValues: false })
										}
									/>
									<Choice
										checked={fieldRemoval.alsoValues}
										label="Remove the values too"
										detail="A copy of each card goes to the recovery folder first."
										onPick={() =>
											setFieldRemoval({ ...fieldRemoval, alsoValues: true })
										}
									/>
								</div>
							)}
							<DialogFooter>
								<Button variant="outline" onClick={() => setFieldRemoval(null)}>
									Keep the field
								</Button>
								<Button
									onClick={() =>
										void run(async () => {
											const r = fieldRemoval;
											const done = await removeField(host, r.typeId, r.label, {
												alsoValues: r.alsoValues,
											});
											setFieldRemoval(null);
											await refresh();
											setMessage(
												r.alsoValues && done.removedValues > 0
													? `Removed "${r.label}". ${plural(done.removedValues, "value")} removed; copies are in the recovery folder.`
													: r.withValue > 0
														? `Removed "${r.label}". ${plural(r.withValue, "card")} kept the value as an extra property.`
														: `Removed "${r.label}".`,
											);
										})
									}
								>
									Remove field
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			<Dialog
				open={typeRemoval !== null}
				onOpenChange={(next) => !next && setTypeRemoval(null)}
			>
				<DialogContent className="res-dialog">
					{typeRemoval && (
						<>
							<DialogHeader>
								<DialogTitle>
									Delete the{" "}
									{types.find((t) => t.id === typeRemoval.typeId)?.name} type?
								</DialogTitle>
								<DialogDescription>
									{typeRemoval.cards > 0
										? `${plural(typeRemoval.cards, "card")} use this type. The cards stay either way; choose where they go.`
										: "No cards use this type, so nothing else changes."}
								</DialogDescription>
							</DialogHeader>
							{typeRemoval.cards > 0 && (
								<>
									<div
										className="res-choices"
										role="radiogroup"
										aria-label="What happens to the cards"
									>
										<Choice
											checked={typeRemoval.choice === "none"}
											label="Keep the cards without a type"
											detail="Every value stays on the card as an extra property. You can give them a type later."
											onPick={() =>
												setTypeRemoval({ ...typeRemoval, choice: "none" })
											}
										/>
										<Choice
											checked={typeRemoval.choice === "move"}
											label="Move the cards to another type"
											detail="Values with a matching field name move across. The rest stay as extra properties."
											onPick={() =>
												setTypeRemoval({ ...typeRemoval, choice: "move" })
											}
										/>
									</div>
									{typeRemoval.choice === "move" && (
										<label className="res-field">
											<span>Move cards to</span>
											<select
												value={typeRemoval.target}
												onChange={(event) =>
													setTypeRemoval({
														...typeRemoval,
														target: event.target.value,
													})
												}
											>
												{types
													.filter((t) => t.id !== typeRemoval.typeId)
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
								<Button variant="outline" onClick={() => setTypeRemoval(null)}>
									Keep the type
								</Button>
								<Button
									disabled={
										typeRemoval.cards > 0 &&
										typeRemoval.choice === "move" &&
										typeRemoval.target === ""
									}
									onClick={() =>
										void run(async () => {
											const r = typeRemoval;
											const name =
												types.find((t) => t.id === r.typeId)?.name ?? "";
											const moveTo =
												r.cards > 0 && r.choice === "move" ? r.target : null;
											const done = await deleteType(host, r.typeId, { moveTo });
											setTypeRemoval(null);
											setMode("view");
											setFilter("all");
											await refresh();
											const target = types.find((t) => t.id === moveTo)?.name;
											setMessage(
												`Deleted the ${name} type.${
													done.cards === 0
														? ""
														: target
															? ` ${plural(done.cards, "card")} moved to ${target}.`
															: ` ${plural(done.cards, "card")} kept their values without a type.`
												}`,
											);
										})
									}
								>
									Delete type
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={removingCard !== null}
				title="Remove this card?"
				description={`"${removingCard?.title ?? ""}" will be taken out of Resources. The file is kept in the vault's hidden recovery folder, not erased.${
					mentions && mentions.length > 0
						? ` ${mentions.length === 1 ? "1 note or canvas mentions" : `${mentions.length} notes and canvases mention`} it (${mentions
								.slice(0, 3)
								.map((m) => m.title)
								.join(
									", ",
								)}${mentions.length > 3 ? ", ..." : ""}). Those links will show as gone; nothing in the notes is changed.`
						: ""
				}`}
				confirmLabel="Remove card"
				onConfirm={() =>
					void run(async () => {
						const target = removingCard;
						setRemovingCard(null);
						if (!target) return;
						await removeCard(host, target.path);
						setSelected(null);
						await refresh();
						setMessage(
							`Removed "${target.title}". It is in the recovery folder.`,
						);
					})
				}
				onCancel={() => setRemovingCard(null)}
			/>
			<ConfirmDialog
				open={discard !== null}
				title="Discard what you typed?"
				description="This card has changes that are not saved yet."
				confirmLabel="Discard"
				cancelLabel="Keep editing"
				onConfirm={() => {
					const action = discard;
					setDiscard(null);
					setForm(null);
					setMode("view");
					action?.();
				}}
				onCancel={() => setDiscard(null)}
			/>
		</>
	);
}

function labelOf(filter: string): string {
	if (filter === "recent") return "Recent";
	if (filter === "none") return "No type";
	return "All";
}

function TypeRow({
	label,
	count,
	active,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="res-row"
			aria-current={active ? "true" : undefined}
			onClick={onClick}
		>
			<span>{label}</span>
			<span className="res-hint">{count}</span>
		</button>
	);
}

function Choice({
	checked,
	label,
	detail,
	onPick,
}: {
	checked: boolean;
	label: string;
	detail: string;
	onPick: () => void;
}) {
	return (
		<label className="res-choice" data-checked={checked}>
			<input
				type="radio"
				name="res-choice"
				checked={checked}
				onChange={onPick}
			/>
			<span>
				<strong>{label}</strong>
				<span className="res-hint">{detail}</span>
			</span>
		</label>
	);
}

function FieldInput({
	id,
	field,
	value,
	onChange,
}: {
	id: string;
	field: ResourceField;
	value: string;
	onChange: (value: string) => void;
}) {
	const problem = field.kind === "link" ? linkProblem(value) : null;
	return (
		<>
			<label className="res-field" htmlFor={id}>
				<span>
					{field.label} <em>{field.required ? "Required" : "Optional"}</em>
				</span>
				{field.kind === "long" ? (
					<textarea
						id={id}
						value={value}
						onChange={(event) => onChange(event.target.value)}
					/>
				) : (
					<Input
						id={id}
						type={
							field.kind === "date"
								? "date"
								: field.kind === "number"
									? "number"
									: field.kind === "link"
										? "text"
										: "text"
						}
						value={value}
						inputMode={field.kind === "link" ? "url" : undefined}
						aria-invalid={problem !== null}
						aria-describedby={problem ? `${id}-error` : undefined}
						onChange={(event) => onChange(event.target.value)}
					/>
				)}
			</label>
			{problem && (
				<p id={`${id}-error`} role="alert" className="res-error">
					{problem}
				</p>
			)}
		</>
	);
}

function AddTypeDialog({
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
								variant={picked.has(s.label) ? "default" : "outline"}
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

function AddFieldDialog({
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
	useEffect(() => {
		if (open) {
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
						if (hint === "") onCreate({ label: clean, kind, required });
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
						{FIELD_KINDS.map((k) => (
							<Button
								key={k}
								type="button"
								size="sm"
								variant={kind === k ? "default" : "outline"}
								aria-pressed={kind === k}
								onClick={() => setKind(k)}
							>
								{KIND_LABELS[k]}
							</Button>
						))}
					</fieldset>
					<div>
						<Button
							type="button"
							size="sm"
							variant={required ? "default" : "outline"}
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
