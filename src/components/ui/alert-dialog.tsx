import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentProps } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// For confirmations that must be answered ("Delete forever?"): it cannot be
// dismissed by clicking outside, and focus starts on the safe choice.

function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
	return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(
	props: ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
	return (
		<AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
	);
}

function AlertDialogContent({
	className,
	...props
}: ComponentProps<typeof AlertDialogPrimitive.Content>) {
	return (
		<AlertDialogPrimitive.Portal>
			<AlertDialogPrimitive.Overlay
				data-slot="alert-dialog-overlay"
				className="fixed inset-0 z-50 bg-foreground/40"
			/>
			<AlertDialogPrimitive.Content
				data-slot="alert-dialog-content"
				className={cn(
					"fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border bg-background p-5 text-foreground shadow-lg outline-none",
					className,
				)}
				{...props}
			/>
		</AlertDialogPrimitive.Portal>
	);
}

function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-dialog-header"
			className={cn("grid gap-1", className)}
			{...props}
		/>
	);
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-dialog-footer"
			className={cn("flex justify-end gap-2", className)}
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
	return (
		<AlertDialogPrimitive.Title
			data-slot="alert-dialog-title"
			className={cn("text-base font-semibold", className)}
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
	return (
		<AlertDialogPrimitive.Description
			data-slot="alert-dialog-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	...props
}: ComponentProps<typeof AlertDialogPrimitive.Action>) {
	return (
		<AlertDialogPrimitive.Action
			className={cn(buttonVariants(), className)}
			{...props}
		/>
	);
}

function AlertDialogCancel({
	className,
	...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
	return (
		<AlertDialogPrimitive.Cancel
			className={cn(buttonVariants({ variant: "secondary" }), className)}
			{...props}
		/>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
};
