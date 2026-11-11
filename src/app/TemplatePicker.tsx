import { Settings } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { listTemplates, type TemplateEntry } from "../core/notes/templates";
import { type Anchor, placeMenu } from "../editor/menu-placement";
import type { Host } from "../host/host";
import "./templates.css";

/**
 * The list that opens from the slash menu's "Template": a search box and every
 * template by its folder and name, beside the caret. Choosing one hands it to
 * `onPick`; the gear opens the template manager. Escape or a click outside
 * closes it and nothing is inserted.
 */
export function TemplatePicker({
	host,
	anchor,
	onPick,
	onManage,
	onClose,
}: {
	host: Host;
	anchor: Anchor;
	onPick: (entry: TemplateEntry) => void;
	onManage: () => void;
	onClose: () => void;
}) {
	const [entries, setEntries] = useState<TemplateEntry[] | null>(null);
	const [failed, setFailed] = useState(false);
	const [query, setQuery] = useState("");
	const root = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let live = true;
		listTemplates(host).then(
			(list) => live && setEntries(list.templates),
			() => live && setFailed(true),
		);
		return () => {
			live = false;
		};
	}, [host]);

	// Place it by the caret, above it when there is no room below. It is placed
	// again whenever the list changes size.
	// biome-ignore lint/correctness/useExhaustiveDependencies: entries and query change the menu's height
	useLayoutEffect(() => {
		const el = root.current;
		if (!el) return;
		el.style.maxHeight = "";
		const placed = placeMenu(
			anchor,
			{ width: el.offsetWidth, height: el.offsetHeight },
			{ width: window.innerWidth, height: window.innerHeight },
		);
		el.style.left = `${placed.left}px`;
		el.style.maxHeight = `min(${placed.maxHeight}px, var(--template-picker-max-height))`;
		el.dataset.side = placed.side;
		if (placed.side === "above") {
			el.style.top = "";
			el.style.bottom = `${placed.offset}px`;
		} else {
			el.style.bottom = "";
			el.style.top = `${placed.offset}px`;
		}
	}, [anchor, entries, query]);

	useEffect(() => {
		const away = (event: PointerEvent) => {
			if (root.current && !root.current.contains(event.target as Node)) {
				onClose();
			}
		};
		document.addEventListener("pointerdown", away);
		return () => document.removeEventListener("pointerdown", away);
	}, [onClose]);

	const q = query.trim().toLowerCase();
	const shown = (entries ?? []).filter(
		(entry) => q === "" || entry.label.toLowerCase().includes(q),
	);

	return (
		<div
			ref={root}
			className="template-picker"
			role="dialog"
			aria-label="Insert a template"
		>
			<Command
				label="Search templates"
				shouldFilter={false}
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						event.stopPropagation();
						onClose();
					}
				}}
			>
				<CommandInput
					autoFocus
					aria-label="Search templates"
					placeholder="Search templates"
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					{failed && (
						<p role="alert" className="template-picker-note">
							The templates could not be read.
						</p>
					)}
					{entries !== null && entries.length === 0 && !failed && (
						<p className="template-picker-note">
							No templates yet. Save a note as a template, or add one in the
							template manager.
						</p>
					)}
					{entries !== null && entries.length > 0 && shown.length === 0 && (
						<CommandEmpty>No templates match.</CommandEmpty>
					)}
					{shown.map((entry) => (
						<CommandItem
							key={entry.path}
							value={entry.path}
							disabled={entry.note === null}
							onSelect={() => onPick(entry)}
							title={entry.problem}
						>
							<span className="template-picker-label">/{entry.label}</span>
							<button
								type="button"
								className="template-picker-gear"
								aria-label={`Manage ${entry.name}`}
								onPointerDown={(event) => event.stopPropagation()}
								onClick={(event) => {
									event.stopPropagation();
									onManage();
								}}
							>
								<Settings aria-hidden="true" />
							</button>
						</CommandItem>
					))}
				</CommandList>
			</Command>
		</div>
	);
}
