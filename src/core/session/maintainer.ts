/**
 * The maintainer switch: a small file on the maintainer's own computer
 * (`maintainer.json` in the app's settings folder) containing
 * `{ "maintainer": true }`. Without it the app shows no developer tools.
 */
export function parseMaintainer(text: string | null): boolean {
	if (text === null) return false;
	try {
		const value: unknown = JSON.parse(text);
		return (
			typeof value === "object" &&
			value !== null &&
			(value as { maintainer?: unknown }).maintainer === true
		);
	} catch {
		return false;
	}
}
