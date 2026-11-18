import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { IconPicker } from "./IconPicker";
import { ICON_BY_NAME } from "./iconCatalog";

export function NoteIconPicker({
	icon,
	onChange,
}: {
	icon: string | undefined;
	onChange?: (icon: string | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const Icon = icon ? ICON_BY_NAME.get(icon) : undefined;
	if (!onChange)
		return Icon ? (
			<Icon className="note-title-icon" aria-hidden="true" />
		) : null;
	const change = (next: string | null) => {
		onChange(next);
		setOpen(false);
	};
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className={Icon ? "note-title-icon-button" : "note-add-icon"}
					aria-label={Icon ? "Change icon" : undefined}
				>
					{Icon ? (
						<Icon className="note-title-icon" aria-hidden="true" />
					) : (
						"Add icon"
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="style-popover"
				align="start"
				aria-label="Note icon"
			>
				<IconPicker selected={icon} onPick={change} />
				{icon !== undefined && (
					<Button variant="ghost" size="sm" onClick={() => change(null)}>
						Remove icon
					</Button>
				)}
			</PopoverContent>
		</Popover>
	);
}
