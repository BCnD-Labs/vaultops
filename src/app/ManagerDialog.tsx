import { type ReactNode, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "./TemplateDialogs";

/** The text of an error, for showing in a message line. */
export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The modal shell the managers share: a dialog with a light overlay, a title
 * and a screen-reader-only description. Closing (Escape, the overlay, the X)
 * goes through `onRequestClose`, so a manager can ask before dropping edits.
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
				className={className}
				lightOverlay
				aria-describedby={descriptionId}
			>
				<DialogTitle>{title}</DialogTitle>
				<DialogDescription id={descriptionId} className="sr-only">
					{description}
				</DialogDescription>
				{children}
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
