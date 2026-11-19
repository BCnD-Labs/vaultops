import { type ReactNode, useState } from "react";
import { FloatingWindow } from "@/components/ui/floating-editor";
import { ConfirmDialog } from "./TemplateDialogs";
import "./manager.css";

/** The text of an error, for showing in a message line. */
export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * The window the managers share: the same movable, resizable floating window
 * as Settings, so the note behind stays usable. It remembers its place per
 * `kind`, comes to the front when clicked or when `focusRequest` changes, and
 * closing (Escape inside it, the X) goes through `onRequestClose`, so a
 * manager can ask before dropping edits. Narrow layouts follow the window's
 * width (`.manager-content` is a size container), not the app's.
 */
export function ManagerDialog({
	open,
	onRequestClose,
	className,
	kind,
	focusRequest,
	title,
	description,
	children,
}: {
	open: boolean;
	onRequestClose: () => void;
	className: string;
	/** Which manager: the key its window's place is remembered under. */
	kind: string;
	focusRequest?: object;
	title: string;
	description: string;
	children: ReactNode;
}) {
	const width = Math.min(928, innerWidth - 16);
	return (
		<FloatingWindow
			open={open}
			title={title}
			description={description}
			className={className}
			kind={kind}
			initial={{
				left: (innerWidth - width) / 2,
				top: 48,
				width,
				height: 640,
			}}
			focusRequest={focusRequest}
			onClose={onRequestClose}
		>
			<div className="manager-content">{children}</div>
		</FloatingWindow>
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
