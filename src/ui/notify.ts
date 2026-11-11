import { toast } from "sonner";

export interface NotifyAction {
	label: string;
	onClick: () => void;
}

/**
 * The app's one way to show a toast. Toasts are only for a confirmation ("Task
 * closed") or an optional offer next to one (a "Reflect" button). They vanish
 * on their own, so never use one for an error, a warning or anything the
 * person has to act on: those stay inline, where they remain until handled.
 */
export function notify(
	message: string,
	options: { action?: NotifyAction; description?: string } = {},
): void {
	toast(message, {
		description: options.description,
		duration: 6000,
		action: options.action && {
			label: options.action.label,
			onClick: options.action.onClick,
		},
	});
}
