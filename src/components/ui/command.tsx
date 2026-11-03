import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Command palette building blocks (cmdk): a search box plus a filtered list,
// used for the quick switcher. CommandDialog shows it in a modal.

function Command({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				"flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function CommandDialog({
	title = "Command palette",
	description = "Search and press Enter",
	children,
	...props
}: ComponentProps<typeof Dialog> & { title?: string; description?: string }) {
	return (
		<Dialog {...props}>
			<DialogContent
				showClose={false}
				className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0"
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">{description}</DialogDescription>
				<Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground">
					{children}
				</Command>
			</DialogContent>
		</Dialog>
	);
}

function CommandInput({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div
			data-slot="command-input-wrapper"
			className="flex h-10 items-center gap-2 border-b-[length:var(--border-width)] border-border px-3"
		>
			<Search className="size-4 shrink-0 text-muted-foreground" />
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					"h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function CommandList({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn("max-h-80 overflow-y-auto p-1", className)}
			{...props}
		/>
	);
}

function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className="py-6 text-center text-sm text-muted-foreground"
			{...props}
		/>
	);
}

function CommandGroup({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn("overflow-hidden", className)}
			{...props}
		/>
	);
}

function CommandItem({
	className,
	...props
}: ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

function CommandShortcut({ className, ...props }: ComponentProps<"span">) {
	return (
		<span
			data-slot="command-shortcut"
			className={cn("ml-auto text-xs text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
};
