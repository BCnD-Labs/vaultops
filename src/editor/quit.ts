/**
 * The window's close-requested handler: save first. If the save fails the
 * window stays open (the "not saved" state is on screen). Asking to close
 * again keeps a copy of the unsaved text (`keepCopy`) and then closes; if the
 * copy can't be kept either, the window stays open once more, and a third ask
 * closes it anyway so the person is never trapped.
 * Returns true to allow the close.
 */
export function createQuitGuard(
	flush: () => Promise<boolean>,
	keepCopy?: () => Promise<boolean>,
): () => Promise<boolean> {
	let asks = 0;
	return async () => {
		let saved = false;
		try {
			saved = await flush();
		} catch {
			saved = false;
		}
		if (saved) return true;
		asks += 1;
		if (asks === 1) return false;
		if (!keepCopy) return true;
		let kept = false;
		try {
			kept = await keepCopy();
		} catch {
			kept = false;
		}
		return kept || asks > 2;
	};
}
