import { Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	addCard,
	type Card,
	type Column,
	moveCard,
	readColumns,
	removeColumn,
	reorderColumn,
} from "../core/kanban";
import { ITEM_TONES, isItemTone, newBlockId } from "../core/notes/canvas-ops";
import "./kanban.css";

export function Board({ node, editor, updateAttributes }: NodeViewProps) {
	const cols = useMemo(
		() => readColumns(node.attrs.columns),
		[node.attrs.columns],
	);
	const board = useRef<HTMLDivElement>(null);
	const drag = useRef<string | null>(null);
	const [gap, setGap] = useState<string | null>(null);
	if (!cols)
		return (
			<NodeViewWrapper contentEditable={false}>
				This board has unsupported data.
			</NodeViewWrapper>
		);
	const editable = editor.isEditable;
	const full = cols.reduce((n, c) => n + c.cards.length, 0) >= 500;
	const save = (columns: Column[]) => {
		if (editor.isEditable) updateAttributes({ columns });
	};
	const change = (col: Column) =>
		save(cols.map((c) => (c.id === col.id ? col : c)));
	const focus = (id: string) =>
		requestAnimationFrame(() =>
			Array.from(
				board.current?.querySelectorAll<HTMLButtonElement>("[data-card]") ?? [],
			)
				.find((el) => el.dataset.card === id)
				?.focus(),
		);
	const btn = (label: string, fn: () => void, disabled = false) => (
		<Button variant="ghost" size="sm" disabled={disabled} onClick={fn}>
			{label}
		</Button>
	);
	function append(col: Column) {
		if (!cols || full) return;
		const card = { id: newBlockId(), text: "" };
		save(addCard(cols, col.id, card));
		requestAnimationFrame(() =>
			Array.from(
				board.current?.querySelectorAll<HTMLInputElement>("[data-text]") ?? [],
			)
				.find((el) => el.dataset.text === card.id)
				?.focus(),
		);
	}
	return (
		<NodeViewWrapper contentEditable={false}>
			<div ref={board} className="kanban">
				{cols.map((col, i) => (
					<section key={col.id} data-column={col.id}>
						<Input
							aria-label="Column title"
							readOnly={!editable}
							value={col.title}
							onChange={(e) => change({ ...col, title: e.target.value })}
						/>
						{editable && (
							<div>
								{btn("←", () => save(reorderColumn(cols, i, -1)), i === 0)}
								{btn(
									"→",
									() => save(reorderColumn(cols, i, 1)),
									i === cols.length - 1,
								)}
								{btn(
									"Delete column",
									() => save(removeColumn(cols, col.id)),
									!!col.cards.length,
								)}
							</div>
						)}
						{col.cards.map((card, j) => {
							const edit = (patch: Partial<Card>) =>
								change({
									...col,
									cards: col.cards.map((c) =>
										c.id === card.id ? { ...c, ...patch } : c,
									),
								});
							const remove = () => {
								change({
									...col,
									cards: col.cards.filter((c) => c.id !== card.id),
								});
								const afterDelete = editor.state.doc;
								toast("Card deleted", {
									action: {
										label: "Undo",
										onClick: () => {
											if (editor.isEditable && editor.state.doc === afterDelete)
												editor.commands.undo();
											else
												toast(
													"Use editor undo to step back through later edits.",
												);
										},
									},
								});
							};
							return (
								<div
									key={card.id}
									className="kanban-card"
									data-before={card.id}
									data-gap={gap === card.id}
									style={{
										borderLeftColor: card.tone
											? `var(--callout-${card.tone}-accent)`
											: undefined,
									}}
								>
									{editable && (
										<Button
											variant="ghost"
											size="sm"
											data-card={card.id}
											aria-label={`Move ${card.text || "card"}`}
											title="Drag or use Alt + arrow keys to move"
											onPointerDown={(e) => {
												if (e.button !== 0) return;
												e.preventDefault();
												e.stopPropagation();
												e.currentTarget.focus();
												e.currentTarget.setPointerCapture(e.pointerId);
												drag.current = card.id;
											}}
											onPointerMove={(e) => {
												if (drag.current !== card.id) return;
												const el = document.elementFromPoint(
													e.clientX,
													e.clientY,
												);
												const target =
													el?.closest<HTMLElement>("[data-column]");
												setGap(
													target && board.current?.contains(target)
														? (el?.closest<HTMLElement>("[data-before]")
																?.dataset.before ??
																target.dataset.column ??
																null)
														: null,
												);
											}}
											onPointerCancel={() => {
												drag.current = null;
												setGap(null);
											}}
											onPointerUp={(e) => {
												if (drag.current !== card.id) return;
												drag.current = null;
												setGap(null);
												const el = document.elementFromPoint(
													e.clientX,
													e.clientY,
												);
												const target =
													el?.closest<HTMLElement>("[data-column]");
												if (
													target?.dataset.column &&
													board.current?.contains(target)
												)
													save(
														moveCard(
															cols,
															card.id,
															target.dataset.column,
															el?.closest<HTMLElement>("[data-before]")?.dataset
																.before,
														),
													);
											}}
											onKeyDown={(e) => {
												if (e.key === "Delete") {
													e.preventDefault();
													remove();
													return;
												}
												if (
													![
														"ArrowLeft",
														"ArrowRight",
														"ArrowUp",
														"ArrowDown",
													].includes(e.key)
												)
													return;
												e.preventDefault();
												e.stopPropagation();
												const dest =
													cols[
														i +
															(e.key === "ArrowLeft"
																? -1
																: e.key === "ArrowRight"
																	? 1
																	: 0)
													];
												if (!dest) return;
												const idx =
													dest !== col
														? Math.min(j, dest.cards.length)
														: j + (e.key === "ArrowUp" ? -1 : 1);
												if (
													idx < 0 ||
													(dest === col && idx >= dest.cards.length)
												)
													return;
												if (e.altKey) {
													save(
														moveCard(
															cols,
															card.id,
															dest.id,
															dest.cards[
																idx + (dest === col && idx > j ? 1 : 0)
															]?.id,
														),
													);
													focus(card.id);
												} else {
													const next =
														dest.cards[Math.min(idx, dest.cards.length - 1)];
													if (next) focus(next.id);
												}
											}}
										>
											⠿
										</Button>
									)}
									<Input
										aria-label="Card text"
										data-text={card.id}
										value={card.text}
										readOnly={!editable}
										onChange={(e) => edit({ text: e.target.value })}
										onKeyDown={(e) => {
											if (
												editable &&
												!e.nativeEvent.isComposing &&
												e.key === "Enter"
											) {
												e.preventDefault();
												append(col);
											}
										}}
									/>
									{editable && (
										<>
											<select
												aria-label="Card colour"
												value={card.tone ?? ""}
												onChange={(e) =>
													edit({
														tone: isItemTone(e.target.value)
															? e.target.value
															: undefined,
													})
												}
											>
												<option value="">Default</option>
												{ITEM_TONES.map((t) => (
													<option key={t}>{t}</option>
												))}
											</select>
											{btn("Delete card", remove)}
										</>
									)}
								</div>
							);
						})}
						<div className="kanban-foot" data-gap={gap === col.id}>
							{editable && btn("Add card", () => append(col), full)}
						</div>
					</section>
				))}
				{editable &&
					btn("Add column", () =>
						save([
							...cols,
							{ id: newBlockId(), title: "New column", cards: [] },
						]),
					)}
				{full && <span>500-card limit reached</span>}
			</div>
		</NodeViewWrapper>
	);
}
export const KanbanBlock = Node.create({
	name: "kanban",
	group: "block",
	atom: true,
	draggable: true,
	addAttributes() {
		return {
			columns: {
				default: null,
				renderHTML: (attrs) => ({
					"data-columns": JSON.stringify(attrs.columns),
				}),
				parseHTML: (el) => {
					const raw = el.dataset.columns;
					try {
						const parsed = JSON.parse(raw ?? "null");
						return readColumns(parsed, true) ?? parsed;
					} catch {
						return raw;
					}
				},
			},
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-type="kanban"]' }];
	},
	renderHTML({ HTMLAttributes }) {
		return ["div", { ...HTMLAttributes, "data-type": "kanban" }];
	},
	addNodeView() {
		return ReactNodeViewRenderer(Board, { ignoreMutation: () => true });
	},
});
