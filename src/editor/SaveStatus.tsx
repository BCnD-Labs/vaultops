import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
			<span role="alert" style={{ color: "var(--bad)" }}>
				Not saved: {state.reason}{" "}
				{keepEditing ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setKeepEditing(false)}
					>
						Resolve
					</Button>
				) : (
					<>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onLoadDisk}
						>
							Load the disk version
						</Button>{" "}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onSaveCopy}
						>
							Save mine as a copy
						</Button>{" "}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setKeepEditing(true)}
						>
							Keep editing
						</Button>
					</>
				)}
			</span>
		);
	}
	if (state.kind === "failed") {
		return (
			<span role="alert" style={{ color: "var(--bad)" }}>
				Not saved: {state.reason}{" "}
				<Button type="button" variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
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
