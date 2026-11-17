import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// One flat, token-driven button for the whole app: no border or shadow on solid
// fills, soft corners (--radius-control), faded when disabled. Hover and pressed
// layers come from the shared `[data-slot="button"]::after` rule in app.css.
// A pressed or "on" button (aria-pressed, data-state=on) shows the soft look
// plus a primary edge, visible on any background in either mode. Soft text is
// primary nudged 25% toward the foreground colour, which keeps it above 4.5:1
// on the tint in every theme.
const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border-[length:var(--border-width)] border-solid border-transparent font-medium font-sans transition-colors focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-pressed:bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] aria-pressed:text-[color:color-mix(in_srgb,var(--primary),var(--foreground)_25%)] aria-pressed:ring-[length:var(--border-width)] aria-pressed:ring-primary/40 aria-pressed:ring-inset data-[state=on]:bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] data-[state=on]:text-[color:color-mix(in_srgb,var(--primary),var(--foreground)_25%)] data-[state=on]:ring-[length:var(--border-width)] data-[state=on]:ring-primary/40 data-[state=on]:ring-inset [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]",
	{
		variants: {
			variant: {
				// Solid
				default: "bg-primary text-primary-foreground",
				secondary:
					"bg-[color-mix(in_srgb,var(--secondary),var(--foreground)_8%)] text-secondary-foreground",
				destructive: "bg-destructive text-destructive-foreground",
				success: "bg-success text-success-foreground",
				warning: "bg-warning text-warning-foreground",
				// Quiet
				soft: "bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[color:color-mix(in_srgb,var(--primary),var(--foreground)_25%)]",
				tonal: "bg-primary-container text-on-primary-container",
				ghost: "bg-transparent text-foreground",
				outline: "border-border bg-background text-foreground",
				link: "bg-transparent text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-[var(--control-height)] px-3 text-sm",
				sm: "h-[var(--control-height-sm)] px-2 text-sm",
				lg: "h-[calc(var(--control-height)+8px)] px-5 text-sm",
				icon: "size-[var(--control-height)]",
				"icon-sm": "size-[var(--control-height-sm)]",
				"icon-lg": "size-[calc(var(--control-height)+8px)]",
			},
			round: { true: "rounded-full", false: "" },
		},
		compoundVariants: [
			{ variant: "link", class: "h-auto px-0" },
			{ size: "icon", class: "px-0" },
			{ size: "icon-sm", class: "px-0" },
			{ size: "icon-lg", class: "px-0" },
		],
		defaultVariants: { variant: "default", size: "default", round: false },
	},
);

type ButtonProps = ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({
	className,
	variant,
	size,
	round,
	asChild = false,
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : "button";
	return (
		<Comp
			className={cn(buttonVariants({ variant, size, round }), className)}
			{...props}
			// After the spread: a wrapper such as DialogClose asChild must not rename it.
			data-slot="button"
			data-variant={variant ?? "default"}
		/>
	);
}

export { Button, buttonVariants };
