import { Plus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Backlink, backlinks } from "../core/links/links";
import {
	addField,
	addType,
	type CardResult,
	cardFields,
	completeness,
	countValues,
	createCard,
	deleteType,
	listCards,
	loadTypes,
	type ResourceCard,
	type ResourceType,
	removeCard,
	removeField,
	searchCards,
	setCardType,
	setFieldRequired,
	updateCard,
} from "../core/resources/resources";
import type { Host } from "../host/host";
import { notify } from "../ui/notify";
import { ManagerDialog, messageOf, useDiscardGuard } from "./ManagerDialog";
import { ConfirmDialog } from "./TemplateDialogs";
import "./resources.css";
import { AddFieldDialog } from "./resources/AddFieldDialog";
import { AddTypeDialog } from "./resources/AddTypeDialog";
import { CardDetail } from "./resources/CardDetail";
import { CardForm } from "./resources/CardForm";
import { CardList } from "./resources/CardList";
import {
	type FieldRemoval,
	FieldRemovalDialog,
	type TypeRemoval,
	TypeRemovalDialog,
} from "./resources/RemoveDialogs";
import {
	type FormState,
	labelOf,
	type Mode,
	plural,
	subtitle,
} from "./resources/resource-utils";
import { TypePicker } from "./resources/TypePicker";
import { TypeRow } from "./resources/TypeRow";
import { TypeSettings } from "./resources/TypeSettings";

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
	const [problem, setProblem] = useState<string | null>(null);
	const [filter, setFilter] = useState("all");
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const [mode, setMode] = useState<Mode>("view");
	const [form, setForm] = useState<FormState | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [removingCard, setRemovingCard] = useState<ResourceCard | null>(null);
	const [typeDialog, setTypeDialog] = useState(false);
	const [fieldDialog, setFieldDialog] = useState<string | null>(null);
	const [fieldRemoval, setFieldRemoval] = useState<FieldRemoval | null>(null);
	const [typeRemoval, setTypeRemoval] = useState<TypeRemoval | null>(null);

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
		setProblem(null);
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
	const { guard, dialog: discardDialog } = useDiscardGuard(
		mode === "form" && dirty,
		{
			title: "Discard what you typed?",
			description: "This card has changes that are not saved yet.",
			confirmLabel: "Discard",
			cancelLabel: "Keep editing",
			onDiscard: () => {
				setForm(null);
				setMode("view");
			},
		},
	);

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
		setProblem(null);
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
		notify(text(saved?.title ?? ""));
	};

	const run = async (work: () => Promise<void>) => {
		try {
			await work();
		} catch (error) {
			setProblem(messageOf(error));
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
			setProblem(null);
		});
	const pickFilter = (next: string) =>
		guard(() => {
			setFilter(next);
			setMode("view");
			setForm(null);
			setProblem(null);
		});

	const idBase = useId();

	const detail = () => {
		if (mode === "pick") {
			return (
				<TypePicker
					types={types}
					onPick={(t) => startForm(t, null)}
					onAddType={() => setTypeDialog(true)}
					onCancel={() => setMode("view")}
				/>
			);
		}
		if (mode === "form") {
			const formType = form ? types.find((t) => t.id === form.typeId) : null;
			if (!form || !formType) return null;
			return (
				<CardForm
					form={form}
					type={formType}
					idBase={idBase}
					formError={formError}
					onChange={setForm}
					onSave={() => void save()}
					onCancel={() =>
						guard(() => {
							setForm(null);
							setMode("view");
						})
					}
				/>
			);
		}
		if (mode === "settings") {
			const type = filterType;
			if (!type) return null;
			return (
				<TypeSettings
					type={type}
					used={cards.filter((c) => c.typeId === type.id).length}
					canWrite={canWrite}
					onToggleRequired={(f) =>
						void run(async () => {
							await setFieldRequired(host, type.id, f.label, !f.required);
							await refresh();
							notify(
								f.required
									? `"${f.label}" is optional again.`
									: `"${f.label}" is now required for new and edited ${type.name} cards. Cards already saved without it are left as they are and flagged.`,
							);
						})
					}
					onRemoveField={(f) =>
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
					onAddField={() => setFieldDialog(type.id)}
					onDone={() => setMode("view")}
					onDeleteType={() => {
						const others = types.filter((t) => t.id !== type.id);
						setTypeRemoval({
							typeId: type.id,
							cards: cards.filter((c) => c.typeId === type.id).length,
							choice: "none",
							target: others[0]?.id ?? "",
						});
					}}
				/>
			);
		}
		return (
			<CardDetail
				card={card}
				cardType={cardType}
				types={types}
				mentions={mentions}
				canWrite={canWrite}
				onNewCard={() => setMode("pick")}
				onEdit={startForm}
				onRemove={setRemovingCard}
				onOpenNote={onOpenNote}
				onSetType={(target, t) =>
					void run(async () => {
						await setCardType(host, target.path, t.id);
						await refresh();
						notify(`"${target.title}" is now a ${t.name}.`);
					})
				}
			/>
		);
	};

	return (
		<>
			<ManagerDialog
				open={open}
				onRequestClose={() => guard(onClose)}
				className="res-manager"
				title="Resource manager"
				description="Contacts, books, articles and your own kinds of resource, kept apart from your notes."
				descriptionId="res-manager-about"
			>
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
				{problem && (
					<p role="alert" className="res-error">
						{problem}
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
							count={Math.min(8, cards.filter((c) => c.updated !== "").length)}
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
					<CardList
						rows={rows}
						types={types}
						query={query}
						filter={filter}
						filterType={filterType}
						loaded={loaded}
						selected={selected}
						onPick={pickCard}
						onEditType={() => guard(() => setMode("settings"))}
					/>
					<section aria-label="Detail" className="res-detail">
						{detail()}
					</section>
				</div>
			</ManagerDialog>

			<AddTypeDialog
				open={typeDialog}
				existing={types.map((t) => t.name)}
				onCancel={() => setTypeDialog(false)}
				onCreate={(name, titleLabel, fields) =>
					void run(async () => {
						const result = await addType(host, { name, titleLabel, fields });
						if (!result.ok) {
							setProblem(result.message);
							return;
						}
						setTypeDialog(false);
						const next = await refresh();
						const made = next?.types.find((t) => t.id === result.id);
						if (made) {
							setFilter(made.id);
							startForm(made, null);
							notify(
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
							setProblem(result.message);
							return;
						}
						const used = cards.filter((c) => c.typeId === fieldDialog).length;
						const name = types.find((t) => t.id === fieldDialog)?.name ?? "";
						setFieldDialog(null);
						await refresh();
						notify(
							`Added "${field.label}" to ${name}. ${plural(used, "card")} now show it empty; nothing else changed.`,
						);
					})
				}
			/>

			<FieldRemovalDialog
				removal={fieldRemoval}
				types={types}
				onChange={setFieldRemoval}
				onCancel={() => setFieldRemoval(null)}
				onConfirm={(r) =>
					void run(async () => {
						const done = await removeField(host, r.typeId, r.label, {
							alsoValues: r.alsoValues,
						});
						setFieldRemoval(null);
						await refresh();
						notify(
							r.alsoValues && done.removedValues > 0
								? `Removed "${r.label}". ${plural(done.removedValues, "value")} removed; copies are in the recovery folder.`
								: r.withValue > 0
									? `Removed "${r.label}". ${plural(r.withValue, "card")} kept the value as an extra property.`
									: `Removed "${r.label}".`,
						);
					})
				}
			/>

			<TypeRemovalDialog
				removal={typeRemoval}
				types={types}
				onChange={setTypeRemoval}
				onCancel={() => setTypeRemoval(null)}
				onConfirm={(r) =>
					void run(async () => {
						const name = types.find((t) => t.id === r.typeId)?.name ?? "";
						const moveTo = r.cards > 0 && r.choice === "move" ? r.target : null;
						const done = await deleteType(host, r.typeId, { moveTo });
						setTypeRemoval(null);
						setMode("view");
						setFilter("all");
						await refresh();
						const target = types.find((t) => t.id === moveTo)?.name;
						notify(
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
			/>

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
						notify(`Removed "${target.title}". It is in the recovery folder.`);
					})
				}
				onCancel={() => setRemovingCard(null)}
			/>
			{discardDialog}
		</>
	);
}
