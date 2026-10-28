import type { AutosaveState } from "./autosave";

/** One line that always says whether the note is safely on disk. */
export function SaveStatus({
	state,
	onRetry,
}: {
	state: AutosaveState;
	onRetry: () => void;
}) {
	if (state.kind === "failed") {
		return (
			<span role="alert" style={{ color: "#b00020" }}>
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
