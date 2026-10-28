import { useEffect, useState } from "react";
import type { AutosaveState } from "./autosave";

/** One line that always says whether the note is safely on disk. */
export function SaveStatus({
	state,
	onRetry,
	onLoadDisk,
	onSaveCopy,
}: {
	state: AutosaveState;
	onRetry: () => void;
	/** Throw away my edits and show what is on disk (only for a changed-on-disk conflict). */
	onLoadDisk?: () => void;
	/** Keep my edits as a separate note, leaving the file on disk alone. */
	onSaveCopy?: () => void;
}) {
	const [keepEditing, setKeepEditing] = useState(false);
	// A new conflict asks again.
	useEffect(() => {
		if (state.kind !== "failed") setKeepEditing(false);
	}, [state.kind]);

	if (state.kind === "failed" && state.conflict) {
		return (
			<span role="alert" style={{ color: "var(--bad, #b00020)" }}>
				Not saved: {state.reason}{" "}
				{keepEditing ? (
					<button type="button" onClick={() => setKeepEditing(false)}>
						Resolve
					</button>
				) : (
					<>
						<button type="button" onClick={onLoadDisk}>
							Load the disk version
						</button>{" "}
						<button type="button" onClick={onSaveCopy}>
							Save mine as a copy
						</button>{" "}
						<button type="button" onClick={() => setKeepEditing(true)}>
							Keep editing
						</button>
					</>
				)}
			</span>
		);
	}
	if (state.kind === "failed") {
		return (
			<span role="alert" style={{ color: "var(--bad, #b00020)" }}>
				Not saved: {state.reason}{" "}
				<button type="button" onClick={onRetry}>
					Retry
				</button>
			</span>
		);
	}
	const text =
		state.kind === "saved"
			? "Saved"
			: state.kind === "saving"
				? "Saving…"
				: "Unsaved changes";
	return <span role="status">{text}</span>;
}
