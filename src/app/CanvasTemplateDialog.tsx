import { LayoutDashboard } from "lucide-react";
import {
	CommandDialog,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	CANVAS_TEMPLATES,
	type CanvasTemplate,
} from "../core/notes/canvas-templates";

/** Choose a starting layout for a new canvas. Nothing is created until one is picked. */
export function CanvasTemplateDialog({
	open,
	onOpenChange,
	onPick,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onPick: (template: CanvasTemplate) => void;
}) {
	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="New canvas from template"
			description="Pick a starting layout for the new canvas"
		>
			<CommandList>
				<CommandGroup heading="Templates">
					{CANVAS_TEMPLATES.map((template) => (
						<CommandItem
							key={template.id}
							value={`${template.name} ${template.description}`}
							onSelect={() => onPick(template)}
						>
							<LayoutDashboard aria-hidden="true" />
							<span>
								{template.name}
								<span className="block text-muted-foreground text-xs">
									{template.description}
								</span>
							</span>
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
