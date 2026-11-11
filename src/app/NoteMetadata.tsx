import {
	Calendar,
	CheckSquare,
	ChevronRight,
	ChevronsUpDown,
	Hash,
	List,
	Tag,
	Type,
	X,
} from "lucide-react";
import { type ReactNode, useContext, useState } from "react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { findName, type Props, readProps } from "../core/notes/properties";
import { removeTag, tagsOf } from "../core/notes/tags";
import { ShellNavigation } from "./AppShell";

const ICONS = {
	text: Type,
	number: Hash,
	date: Calendar,
	checkbox: CheckSquare,
	list: List,
	select: ChevronsUpDown,
};

/** The chip summary. No longer shown in the note (PropertiesBlock replaced it); kept for now. */
export function NoteChips({
	props,
	editable,
	onChange,
}: {
	props: Props | null;
	editable: boolean;
	onChange: (next: Props) => void;
}) {
	const { openProperties } = useContext(ShellNavigation);
	const items = props
		? readProps(props)
				.filter((item) => item.known && item.name !== findName(props, "tags"))
				.slice(0, 3)
		: [];
	return (
		<section className="note-chips" aria-label="Note tags and properties">
			{props &&
				tagsOf(props).map((tag) => (
					<span className="note-meta-chip" key={tag}>
						<Tag aria-hidden="true" />
						{tag}
						{editable && (
							<button
								type="button"
								className="chip-remove"
								aria-label={`Remove ${tag} from tags`}
								onClick={() => onChange(removeTag(props, tag))}
							>
								<X aria-hidden="true" />
							</button>
						)}
					</span>
				))}
			{items.map((item) => {
				if (!item.known) return null;
				const Icon = ICONS[item.type];
				const value = Array.isArray(item.value)
					? item.value.join(", ")
					: typeof item.value === "boolean"
						? item.value
							? "Yes"
							: "No"
						: String(item.value ?? "");
				return (
					<button
						type="button"
						className="note-meta-chip"
						key={item.name}
						title={`${item.name}: ${value || "Empty"}`}
						aria-label={`Open property ${item.name}`}
						onClick={() => openProperties(item.name)}
					>
						<Icon aria-hidden="true" />
						<span>{value || item.name}</span>
					</button>
				);
			})}
			<button
				type="button"
				className="note-meta-chip note-more"
				onClick={() => openProperties()}
			>
				+ More
			</button>
		</section>
	);
}

const DETAILS_KEY = "vaultops:note-details-open";
export function NoteDetails({
	path,
	count,
	status,
}: {
	path: string;
	count: number | null;
	status: ReactNode;
}) {
	const [open, setOpen] = useState(() => {
		try {
			return localStorage.getItem(DETAILS_KEY) === "true";
		} catch {
			return false;
		}
	});
	return (
		<Collapsible
			className="note-details"
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				try {
					localStorage.setItem(DETAILS_KEY, String(next));
				} catch {
					/* Storage is optional. */
				}
			}}
		>
			<CollapsibleTrigger className="note-details-trigger section-label">
				<ChevronRight aria-hidden="true" />
				Details
			</CollapsibleTrigger>
			<CollapsibleContent>
				<dl>
					<div>
						<dt>File path</dt>
						<dd>{path}</dd>
					</div>
					<div>
						<dt>Blocks</dt>
						<dd>{count ?? "Unavailable"}</dd>
					</div>
					<div>
						<dt>Status</dt>
						<dd>{status}</dd>
					</div>
				</dl>
			</CollapsibleContent>
		</Collapsible>
	);
}
