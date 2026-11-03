import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center gap-1 whitespace-nowrap rounded-full border-[length:var(--border-width)] px-2 py-0.5 text-xs font-medium [&_svg]:size-3",
	{
		variants: {
			variant: {
				default: "border-transparent bg-accent text-accent-foreground",
				outline: "border-border text-muted-foreground",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Badge({
	className,
	variant,
	...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return (
		<span
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
