import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Compact controls share the app palette and keyboard focus treatment.
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-solid border-border font-medium font-sans transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				tonal: "bg-primary-container text-on-primary-container",
				outline: "bg-background text-foreground",
				ghost: "bg-transparent text-foreground border-transparent",
				secondary: "bg-secondary text-secondary-foreground",
				destructive: "bg-destructive text-destructive-foreground",
			},
			size: {
				default: "h-[var(--control-height)] px-3 text-sm",
				sm: "h-[var(--control-height-sm)] px-2 text-sm",
				icon: "size-[var(--control-height)]",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : "button";
	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
