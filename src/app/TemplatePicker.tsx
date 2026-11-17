import { Settings } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverAnchor,
	PopoverContent,
} from "@/components/ui/popover";
import { listTemplates, type TemplateEntry } from "../core/notes/templates";
import type { Anchor } from "../editor/menu-placement";
import type { Host } from "../host/host";
import "./templates.css";

/**
 * The list that opens from the slash menu's "Template": a search box and every
 * template by its folder and name, beside the caret. Choosing one hands it to
 * `onPick`; the gear opens the template manager. Escape or a click outside
 * closes it and nothing is inserted. It is a Popover hung on a virtual anchor
 * at the caret, so placement, collisions, click-away and Escape come from Radix.
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
	// A zero-width box at the caret for Radix to place the popover against.
	const virtualRef = useMemo(
		() => ({
			current: {
				getBoundingClientRect: () =>
					DOMRect.fromRect({
						x: anchor.left,
						y: anchor.top,
						width: 0,
						height: anchor.bottom - anchor.top,
					}),
			},
		}),
		[anchor],
	);

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

	const q = query.trim().toLowerCase();
	const shown = (entries ?? []).filter(
		(entry) => q === "" || entry.label.toLowerCase().includes(q),
	);

	return (
		<Popover
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<PopoverAnchor virtualRef={virtualRef} />
			<PopoverContent
				className="template-picker"
				aria-label="Insert a template"
				side="bottom"
				align="start"
				collisionPadding={8}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<Command label="Search templates" shouldFilter={false}>
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
						{entries === null && !failed && (
							<p className="template-picker-note">Loading templates…</p>
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
			</PopoverContent>
		</Popover>
	);
}
