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
				"inline-flex items-center rounded-md border-[length:var(--border-width)] border-border bg-background p-0.5",
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
				"inline-flex h-[var(--control-height-sm)] min-w-7 items-center justify-center gap-1.5 rounded-sm px-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/40 disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

export { ToggleGroup, ToggleGroupItem };
