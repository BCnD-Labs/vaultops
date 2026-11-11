import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Switch({
	className,
	...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"peer inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0 border-[length:var(--border-width)] border-transparent bg-border outline-none transition-colors focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/40 disabled:opacity-50 data-[state=checked]:bg-primary",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
		</SwitchPrimitive.Root>
	);
}

export { Switch };
