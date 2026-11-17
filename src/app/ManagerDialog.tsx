import { type ReactNode, useState } from "react";
import { CloseButton } from "@/components/ui/close-button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./TemplateDialogs";
import "./manager.css";

/** The text of an error, for showing in a message line. */
export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The modal shell the managers share: a window like Settings, with a light
 * overlay, a quiet centred title bar (the close button on its left; the
 * `.settings-*` title bar classes are reused so the two stay alike) and a
 * screen-reader-only description. Closing (Escape, the overlay, the X) goes
 * through `onRequestClose`, so a manager can ask before dropping edits.
 */
export function ManagerDialog({
	open,
	onRequestClose,
	className,
	title,
	description,
	descriptionId,
	children,
}: {
	open: boolean;
	onRequestClose: () => void;
	className: string;
	title: string;
	description: string;
	descriptionId: string;
	children: ReactNode;
}) {
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) onRequestClose();
			}}
		>
			<DialogContent
				className={cn("manager-dialog", className)}
				lightOverlay
				showClose={false}
				aria-describedby={descriptionId}
			>
				<header className="settings-titlebar">
					<DialogClose asChild>
						<CloseButton className="settings-close" />
					</DialogClose>
					<DialogTitle className="settings-window-title">{title}</DialogTitle>
					<DialogDescription id={descriptionId} className="sr-only">
						{description}
					</DialogDescription>
				</header>
				<div className="manager-content">{children}</div>
			</DialogContent>
		</Dialog>
	);
}

/** What the "Discard…?" question says, and what happens when it is confirmed. */
export interface DiscardCopy {
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel: string;
	/** Runs when the user confirms, just before the guarded action. */
	onDiscard?: () => void;
}

/**
 * Wraps anything that would drop typed edits. When `isDirty` is false the
 * action runs at once; otherwise `dialog` asks first. "Keep editing" (the
 * cancel button) is the safe choice and leaves the action unrun.
 * Render `dialog` somewhere in the manager.
 */
export function useDiscardGuard(isDirty: boolean, copy: DiscardCopy) {
	const [pending, setPending] = useState<(() => void) | null>(null);

	const guard = (action: () => void) => {
		if (isDirty) setPending(() => action);
		else action();
	};

	const dialog = (
		<ConfirmDialog
			open={pending !== null}
			title={copy.title}
			description={copy.description}
			confirmLabel={copy.confirmLabel}
			cancelLabel={copy.cancelLabel}
			onConfirm={() => {
				const action = pending;
				setPending(null);
				copy.onDiscard?.();
				action?.();
			}}
			onCancel={() => setPending(null)}
		/>
	);

	return { guard, dialog };
}
