import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CloseButton } from "./close-button";

function Dialog(props: ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	light = false,
	...props
}: ComponentProps<typeof DialogPrimitive.Overlay> & { light?: boolean }) {
	return (
		<DialogPrimitive.Overlay
			data-slot="dialog-overlay"
			data-variant={light ? "light" : undefined}
			className={cn(
				"fixed inset-0 z-50",
				light ? "bg-foreground/15 backdrop-blur-[2px]" : "bg-foreground/40",
				className,
			)}
			{...props}
		/>
	);
}

function DialogContent({
	className,
	children,
	showClose = true,
	lightOverlay = false,
	...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
	showClose?: boolean;
	/** A subtle dim and blur, so the app stays visible behind a manager window. */
	lightOverlay?: boolean;
}) {
	return (
		<DialogPrimitive.Portal>
			<DialogOverlay light={lightOverlay} />
			<DialogPrimitive.Content
				data-slot="dialog-content"
				className={cn(
					"fixed top-1/2 left-1/2 z-50 box-border grid max-h-[calc(100%-var(--space-8))] w-[calc(100%-var(--space-8))] max-w-md grid-cols-[minmax(0,1fr)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-lg border-[length:var(--border-width)] border-solid border-border bg-background p-5 text-foreground shadow-lg outline-none wrap-anywhere",
					className,
				)}
				{...props}
			>
				{children}
				{showClose && (
					<DialogPrimitive.Close asChild>
						<CloseButton className="dialog-close absolute top-3 right-3" />
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-header"
			className={cn("grid gap-1", className)}
			{...props}
		/>
	);
}

function DialogFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			data-slot="dialog-footer"
			className={cn("flex flex-wrap items-center justify-end gap-2", className)}
			{...props}
		/>
	);
}

function DialogTitle({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="dialog-title"
			className={cn("m-0 text-base font-semibold", className)}
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn("m-0 text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogTitle,
	DialogTrigger,
};
