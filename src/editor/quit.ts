/**
 * The window's close-requested handler: save first. If the save fails the
 * window stays open (the "not saved" state is on screen); asking to close
 * again closes it anyway, because the person has seen the warning.
 * Returns true to allow the close.
 */
export function createQuitGuard(
	flush: () => Promise<boolean>,
): () => Promise<boolean> {
	let blocked = false;
	return async () => {
		let saved = false;
		try {
			saved = await flush();
		} catch {
			saved = false;
		}
		if (saved) return true;
		if (blocked) return true;
		blocked = true;
		return false;
	};
}
