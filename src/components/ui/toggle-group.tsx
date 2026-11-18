import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function ToggleGroup({
	className,
	...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root>) {
	return (
		<ToggleGroupPrimitive.Root
			data-slot="toggle-group"
			className={cn(
				"inline-flex items-center rounded-md border-[length:var(--border-width)] border-solid border-border bg-background p-0.5",
				className,
			)}
			{...props}
		/>
	);
}

function ToggleGroupItem({
	className,
	...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item>) {
	return (
		<ToggleGroupPrimitive.Item
			data-slot="toggle-group-item"
			className={cn(
				"inline-flex h-[var(--control-height-sm)] min-w-7 items-center justify-center gap-1.5 cursor-pointer rounded-sm border-0 bg-transparent px-2 text-sm text-foreground outline-none transition-colors hover:bg-muted disabled:cursor-default focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/40 disabled:opacity-50 data-[state=on]:bg-primary-container data-[state=on]:font-semibold data-[state=on]:text-on-primary-container [&_svg]:size-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

export { ToggleGroup, ToggleGroupItem };
