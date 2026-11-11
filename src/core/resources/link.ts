/**
 * What a card's Link field accepts: a web address (`http://` or `https://`),
 * an email link (`mailto:name@site.com`) or a phone link (`tel:+15551234567`).
 * Empty is fine; whether a link is required is the field's own setting.
 */

const MAIL = /^[^\s@?#]+@[^\s@?#]+\.[^\s@?#]{2,}(\?\S*)?$/;
const PHONE = /^\+?[0-9().-]{3,}$/;

/** The reason a link is not accepted, in plain words, or null when it is fine (or empty). */
export function linkProblem(value: string): string | null {
	const text = value.trim();
	if (text === "") return null;
	if (/\s/.test(text)) return "A link can't have spaces in it.";
	const lower = text.toLowerCase();
	if (lower.startsWith("mailto:")) {
		return MAIL.test(text.slice(7))
			? null
			: "That email link needs an address, like mailto:name@site.com.";
	}
	if (lower.startsWith("tel:")) {
		const number = text.slice(4);
		return PHONE.test(number) && (number.match(/[0-9]/g) ?? []).length >= 3
			? null
			: "That phone link needs a number, like tel:+15551234567.";
	}
	if (!/^https?:\/\//i.test(text)) {
		return "Start the link with https:// (or http://, mailto: or tel:).";
	}
	let url: URL;
	try {
		url = new URL(text);
	} catch {
		return "That doesn't look like a web address.";
	}
	const host = url.hostname;
	const isHost =
		host === "localhost" || host.includes(".") || host.startsWith("[");
	if (!isHost || host.startsWith(".") || host.endsWith(".")) {
		return "That web address needs a site name, like https://example.com.";
	}
	return null;
}
