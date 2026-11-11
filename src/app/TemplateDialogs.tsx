import { useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Ask for one name. Submitting with Enter or the button; nothing happens until then. */
export function NameDialog({
	open,
	title,
	description,
	label,
	initial = "",
	confirmLabel,
	error,
	busy = false,
	onSubmit,
	onCancel,
}: {
	open: boolean;
	title: string;
	description?: string;
	label: string;
	initial?: string;
	confirmLabel: string;
	/** Why the last try was refused, shown under the box. */
	error?: string | null;
	busy?: boolean;
	onSubmit: (name: string) => void;
	onCancel: () => void;
}) {
	const [value, setValue] = useState(initial);
	useEffect(() => {
		if (open) setValue(initial);
	}, [open, initial]);
	return (
		<Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
			<DialogContent className="tpl-name-dialog">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						if (value.trim() !== "" && !busy) onSubmit(value);
					}}
				>
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>{description ?? label}</DialogDescription>
					</DialogHeader>
					<Input
						autoFocus
						aria-label={label}
						value={value}
						onChange={(event) => setValue(event.target.value)}
					/>
					{error && (
						<p role="alert" className="tpl-error">
							{error}
						</p>
					)}
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onCancel}>
							Cancel
						</Button>
						<Button type="submit" disabled={value.trim() === "" || busy}>
							{confirmLabel}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/** A question with two answers. The safe answer is the Cancel button. */
export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel,
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
}: {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
