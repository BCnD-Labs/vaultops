import type { ComponentProps } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

// Thin wrappers over react-resizable-panels (v4 names: Group, Panel,
// Separator). Pass `orientation="vertical"` to the group to stack panels.

function ResizablePanelGroup({
	className,
	...props
}: ComponentProps<typeof Group>) {
	return (
		<Group
			data-slot="resizable-panel-group"
			className={cn("flex h-full w-full", className)}
			{...props}
		/>
	);
}

function ResizablePanel(props: ComponentProps<typeof Panel>) {
	return <Panel data-slot="resizable-panel" {...props} />;
}

function ResizableHandle({
	className,
	...props
}: ComponentProps<typeof Separator>) {
	return (
		<Separator
			data-slot="resizable-handle"
			className={cn(
				"relative flex w-px shrink-0 items-center justify-center bg-border transition-colors after:absolute after:inset-y-0 after:left-1/2 after:w-1.5 after:-translate-x-1/2 hover:bg-ring focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-ring data-[separator=active]:bg-ring aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:inset-x-0 aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1.5 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
				className,
			)}
			{...props}
		/>
	);
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
