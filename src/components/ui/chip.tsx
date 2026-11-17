import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { Tone } from "@/app/appearance";
import { cn } from "@/lib/utils";
import { CloseButton } from "./close-button";

// A small label: a soft fill and text in the tag's colour, with the same corner
// shape, height and type as the buttons. The text is the colour pulled toward the
// foreground (--tone-text-mix less 15 points), which keeps it above 4.5:1 on its
// own tint on every surface in light and dark; the tint carries the colour. With
// no tone the chip is a quiet neutral.
type ChipProps = Omit<ComponentProps<"span">, "children"> & {
	/** A tag colour name (the theme's --tone-<name>); neutral when left out. */
	tone?: Tone;
	/** When set, the chip ends with a remove button. */
	onRemove?: () => void;
	/** The remove button's accessible name, for example "Remove tag test". */
	removeLabel?: string;
	children: ReactNode;
};

function Chip({
	tone,
	onRemove,
	removeLabel = "Remove",
	className,
	style,
	children,
	...props
}: ChipProps) {
	return (
		<span
			data-slot="chip"
			data-tone={tone}
			className={cn(
				"inline-flex h-[var(--control-height-sm)] max-w-full items-center gap-1 whitespace-nowrap rounded-md px-2 font-medium font-sans text-sm [&_svg]:size-3 [&_svg]:shrink-0",
				tone
					? "bg-[color-mix(in_srgb,var(--chip-tone)_18%,transparent)] text-[color:color-mix(in_srgb,var(--chip-tone)_calc(var(--tone-text-mix)-15%),var(--foreground))]"
					: "bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-foreground",
				onRemove && "pr-0.5",
				className,
			)}
			style={
				tone
					? ({
							"--chip-tone": `var(--tone-${tone})`,
							...style,
						} as CSSProperties)
					: style
			}
			{...props}
		>
			{children}
			{onRemove && (
				<CloseButton
					label={removeLabel}
					title={removeLabel}
					onClick={onRemove}
					className="size-5 text-inherit [&_svg]:size-3"
				/>
			)}
		</span>
	);
}

export type { ChipProps };
export { Chip };
