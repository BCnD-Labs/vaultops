import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** A keyboard shortcut hint, for example <Kbd>⌘K</Kbd>. */
function Kbd({ className, ...props }: ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				"pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border-[length:var(--border-width)] border-border bg-muted px-1 font-sans text-xs font-medium text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export { Kbd };
