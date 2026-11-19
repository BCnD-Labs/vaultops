import { ChevronsUpDown, Shapes } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResourceType } from "../core/resources/resources";

/** What the Properties panel and block need to show and change a note's type. */
export interface TypeApi {
	types: ResourceType[];
	/** The note's type id; null for none. */
	typeId: string | null;
	/** Give the note a type (null removes it). Returns why it was refused, or null. */
	onChange: (type: ResourceType | null) => string | null;
}

/**
 * The type chip: a menu to pick, change or remove the note's type. Picking adds
 * only the missing fields; removing keeps every value (see `applyType`).
 */
export function TypeRow({
	api,
	editable,
	icon = false,
	onInsertTemplate,
}: {
	api: TypeApi;
	editable: boolean;
	/** The block lines up a type icon with its other rows. */
	icon?: boolean;
	/** The block offers the type's template as its own button. */
	onInsertTemplate?: () => void;
}) {
	const { types, typeId, onChange } = api;
	const [message, setMessage] = useState<string | null>(null);
	const current = types.find((t) => t.id === typeId);
	if (types.length === 0 && typeId === null) return null;
	const set = (type: ResourceType | null) => setMessage(onChange(type));
	return (
		<>
			<div className="prop-row type-row" data-property="type">
				{icon && (
					<span className="prop-type-icon" aria-hidden="true">
						<Shapes />
					</span>
				)}
				<span className="prop-name">type</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild disabled={!editable}>
						<Button variant="outline" size="sm" aria-label="Note type">
							{current?.name ?? (typeId ? "Unknown type" : "No type")}
							<ChevronsUpDown aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuRadioGroup
							value={typeId ?? ""}
							onValueChange={(id) =>
								set(types.find((t) => t.id === id) ?? null)
							}
						>
							{types.map((t) => (
								<DropdownMenuRadioItem key={t.id} value={t.id}>
									{t.name}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
						{typeId !== null && (
							<>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => set(null)}>
									Remove type
								</DropdownMenuItem>
							</>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				{onInsertTemplate && current?.template && editable && (
					<Button variant="ghost" size="sm" onClick={onInsertTemplate}>
						Insert the type's template
					</Button>
				)}
			</div>
			{message && (
				<p role="alert" className="notice">
					{message}
				</p>
			)}
		</>
	);
}
