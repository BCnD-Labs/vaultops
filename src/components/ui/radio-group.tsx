import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function RadioGroup({
	className,
	...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			className={cn("grid gap-2", className)}
			{...props}
		/>
	);
}

function RadioGroupItem({
	className,
	...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-group-item"
			className={cn(
				"peer aspect-square size-4 shrink-0 rounded-full border-[length:var(--border-width)] border-border bg-background outline-none transition-colors focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/40 disabled:opacity-50 data-[state=checked]:border-primary",
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="flex items-center justify-center after:block after:size-2 after:rounded-full after:bg-primary"
			/>
		</RadioGroupPrimitive.Item>
	);
}

export { RadioGroup, RadioGroupItem };
