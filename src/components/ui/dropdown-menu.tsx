import * as P from "@radix-ui/react-dropdown-menu";
import { Check, Circle } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const content =
	"z-50 min-w-40 overflow-hidden rounded-md border-[length:var(--border-width)] border-border bg-background p-1 text-foreground shadow-md";
const item =
	"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0";

function DropdownMenu(props: ComponentProps<typeof P.Root>) {
	return <P.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: ComponentProps<typeof P.Trigger>) {
	return <P.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
	className,
	sideOffset = 4,
	...props
}: ComponentProps<typeof P.Content>) {
	return (
		<P.Portal>
			<P.Content
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				className={cn(content, className)}
				{...props}
			/>
		</P.Portal>
	);
}

function DropdownMenuItem({
	className,
	variant = "default",
	...props
}: ComponentProps<typeof P.Item> & { variant?: "default" | "destructive" }) {
	return (
		<P.Item
			data-slot="dropdown-menu-item"
			data-variant={variant}
			className={cn(
				item,
				"data-[variant=destructive]:text-destructive",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	...props
}: ComponentProps<typeof P.CheckboxItem>) {
	return (
		<P.CheckboxItem
			data-slot="dropdown-menu-checkbox-item"
			className={cn(item, "pl-8", className)}
			{...props}
		>
			<span className="absolute left-2 flex size-4 items-center justify-center">
				<P.ItemIndicator>
					<Check />
				</P.ItemIndicator>
			</span>
			{children}
		</P.CheckboxItem>
	);
}

function DropdownMenuRadioGroup(props: ComponentProps<typeof P.RadioGroup>) {
	return <P.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
	className,
	children,
	...props
}: ComponentProps<typeof P.RadioItem>) {
	return (
		<P.RadioItem
			data-slot="dropdown-menu-radio-item"
			className={cn(item, "pl-8", className)}
			{...props}
		>
			<span className="absolute left-2 flex size-4 items-center justify-center">
				<P.ItemIndicator>
					<Circle className="size-2 fill-current" />
				</P.ItemIndicator>
			</span>
			{children}
		</P.RadioItem>
	);
}

function DropdownMenuLabel({
	className,
	...props
}: ComponentProps<typeof P.Label>) {
	return (
		<P.Label
			data-slot="dropdown-menu-label"
			className={cn(
				"px-2 py-1.5 text-xs font-medium text-muted-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: ComponentProps<typeof P.Separator>) {
	return (
		<P.Separator
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1 my-1 h-px bg-border", className)}
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
};
