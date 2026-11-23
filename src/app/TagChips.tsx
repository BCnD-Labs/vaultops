import { Plus } from "lucide-react";
import { createContext, useContext, useId, useRef, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import {
	type KnownTag,
	sameTagAs,
	suggestTags,
} from "../core/notes/tag-suggest";
import { useAppearance } from "./AppearanceContext";
import { tagTone } from "./appearance";

/** Every tag used in the open vault, most used first (empty outside a vault). */
export const VaultTags = createContext<KnownTag[]>([]);

type Option = { kind: "known"; tag: KnownTag } | { kind: "new"; tag: string };

const notesLabel = (n: number) => (n === 1 ? "1 note" : `${n} notes`);

/**
 * A note's tags as chips, with a field that suggests tags already used in the
 * vault while typing, so `School` or `ADD-103` don't end up next to `school`
 * and `add103`. Enter or Tab takes the highlighted suggestion; the last row
 * ("Add … as a new tag") or Escape then Enter keeps the spelling as typed.
 * Backspace in the empty field removes the last tag.
 */
export function TagChips(props: {
	tags: string[];
	editable: boolean;
	onAdd: (tag: string) => void;
	onRemove: (tag: string) => void;
	onPick?: (tag: string) => void;
}) {
	const known = useContext(VaultTags);
	const { appearance } = useAppearance();
	const [draft, setDraft] = useState("");
	const [active, setActive] = useState(0);
	const [dismissed, setDismissed] = useState(false);
	const input = useRef<HTMLInputElement>(null);
	const listId = useId();

	const typed = draft.trim().replace(/^#+/, "");
	const suggestions = suggestTags(known, draft, props.tags);
	const options: Option[] = suggestions.map((tag) => ({ kind: "known", tag }));
	if (typed !== "" && !suggestions.some((s) => s.tag === typed)) {
		options.push({ kind: "new", tag: typed });
	}
	const open = !dismissed && suggestions.length > 0;
	const current = open ? Math.min(active, options.length - 1) : -1;

	const commit = (tag: string) => {
		if (tag.trim() === "") return;
		props.onAdd(tag);
		setDraft("");
		setActive(0);
		setDismissed(false);
	};
	const choose = (option: Option) =>
		commit(option.kind === "known" ? option.tag.tag : option.tag);

	return (
		<span className="chips">
			{props.tags.map((tag) => (
				<Chip
					key={tag}
					tone={tagTone(tag, appearance)}
					onRemove={props.editable ? () => props.onRemove(tag) : undefined}
					removeLabel={`Remove ${tag} from tags`}
				>
					{props.onPick ? (
						<button
							type="button"
							className="chip-label"
							title={`Show notes tagged ${tag}`}
							onClick={() => props.onPick?.(tag)}
						>
							{tag}
						</button>
					) : (
						<span>{tag}</span>
					)}
				</Chip>
			))}
			{props.editable && (
				<Popover open={open}>
					<PopoverAnchor asChild>
						<Input
							ref={input}
							role="combobox"
							aria-expanded={open}
							aria-controls={open ? listId : undefined}
							aria-activedescendant={
								current >= 0 ? `${listId}-${current}` : undefined
							}
							aria-autocomplete="list"
							className="chip-input h-[var(--control-height-sm)] w-[90px]"
							aria-label="Add to tags"
							placeholder="Add tag"
							value={draft}
							onChange={(e) => {
								setDraft(e.target.value);
								setActive(0);
								setDismissed(false);
							}}
							onKeyDown={(e) => {
								const option = current >= 0 ? options[current] : undefined;
								if (e.key === "ArrowDown" && open) {
									e.preventDefault();
									setActive((current + 1) % options.length);
								} else if (e.key === "ArrowUp" && open) {
									e.preventDefault();
									setActive((current - 1 + options.length) % options.length);
								} else if (e.key === "Escape" && open) {
									e.preventDefault();
									setDismissed(true);
								} else if (e.key === "Tab" && option && !e.shiftKey) {
									e.preventDefault();
									choose(option);
								} else if (e.key === "Enter" || e.key === ",") {
									e.preventDefault();
									if (option) choose(option);
									else commit(draft);
								} else if (
									e.key === "Backspace" &&
									draft === "" &&
									props.tags.length > 0
								) {
									e.preventDefault();
									props.onRemove(props.tags[props.tags.length - 1] as string);
								}
							}}
							onBlur={() => {
								// Leaving the field keeps what was typed, but a different
								// spelling of a known tag becomes that tag unless declined.
								const same = dismissed ? null : sameTagAs(known, draft);
								commit(same ? same.tag : draft);
							}}
						/>
					</PopoverAnchor>
					<PopoverContent
						align="start"
						className="tag-suggest w-60 p-1"
						onOpenAutoFocus={(e) => e.preventDefault()}
						onCloseAutoFocus={(e) => e.preventDefault()}
						onEscapeKeyDown={() => setDismissed(true)}
						onInteractOutside={(e) => {
							if (input.current?.contains(e.target as Node)) e.preventDefault();
							else setDismissed(true);
						}}
					>
						<div id={listId} role="listbox" aria-label="Tag suggestions">
							{options.map((option, index) => (
								// biome-ignore lint/a11y/useKeyWithClickEvents: the field handles the keys (arrows, Enter, Tab).
								// biome-ignore lint/a11y/useFocusableInteractive: options are reached with aria-activedescendant, not focus.
								<div
									key={`${option.kind}:${option.kind === "known" ? option.tag.tag : option.tag}`}
									id={`${listId}-${index}`}
									role="option"
									aria-selected={index === current}
									data-active={index === current || undefined}
									// Keep focus in the field so the choice lands there.
									onMouseDown={(e) => e.preventDefault()}
									onMouseEnter={() => setActive(index)}
									onClick={() => choose(option)}
								>
									{option.kind === "known" ? (
										<>
											<Chip tone={tagTone(option.tag.tag, appearance)}>
												{option.tag.tag}
											</Chip>
											<span className="tag-suggest-count">
												{notesLabel(option.tag.count)}
											</span>
										</>
									) : (
										<span className="tag-suggest-new">
											<Plus aria-hidden="true" /> Add “{option.tag}” as a new
											tag
										</span>
									)}
								</div>
							))}
						</div>
					</PopoverContent>
				</Popover>
			)}
		</span>
	);
}
