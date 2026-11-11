import { useState } from "react";
import type { Note } from "../core/note-format";
import { saveTemplate } from "../core/notes/templates";
import type { Host } from "../host/host";
import { ConfirmDialog, NameDialog } from "./TemplateDialogs";

/**
 * "Save as template": asks for a name, then saves the note's blocks as a
 * template. A name already in use asks before replacing, and the replaced
 * template is kept in the recovery folder.
 */
export function SaveTemplateDialog({
	open,
	host,
	defaultName,
	note,
	onSaved,
	onClose,
}: {
	open: boolean;
	host: Host;
	defaultName: string;
	/** The note as it is now, including what is typed but not yet saved. */
	note: () => Note | null;
	onSaved: (name: string) => void;
	onClose: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [replace, setReplace] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const done = (name: string) => {
		setError(null);
		setReplace(null);
		onSaved(name.trim());
		onClose();
	};
	const attempt = async (name: string, replacing: boolean) => {
		const source = note();
		if (!source) {
			setError("This note can't be saved as a template.");
			return;
		}
		setBusy(true);
		try {
			const result = await saveTemplate(host, name, source, {
				replace: replacing,
			});
			if (result.ok) done(name);
			else if (result.reason === "exists") setReplace(name);
			else setError(result.message);
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<NameDialog
				open={open && replace === null}
				title="Save as template"
				description="The template keeps this note's blocks. {{title}}, {{date}} and {{time}} in the text are filled in when it is used."
				label="Template name"
				initial={defaultName}
				confirmLabel="Save"
				error={error}
				busy={busy}
				onSubmit={(name) => void attempt(name, false)}
				onCancel={() => {
					setError(null);
					onClose();
				}}
			/>
			<ConfirmDialog
				open={open && replace !== null}
				title="Replace this template?"
				description={`A template called "${replace ?? ""}" already exists. Replacing it keeps the old one in the vault's hidden recovery folder.`}
				confirmLabel="Replace"
				cancelLabel="Choose another name"
				onConfirm={() => replace !== null && void attempt(replace, true)}
				onCancel={() => setReplace(null)}
			/>
		</>
	);
}
