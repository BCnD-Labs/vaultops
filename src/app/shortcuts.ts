import {
	hintKeys,
	type KeyEventLike,
	matchesBinding,
	shortcutKey,
} from "../core/settings/shortcuts";
import { settings } from "./settings";

/** Whether this is a Mac (the key hint says Cmd there and Ctrl elsewhere). */
export function isMacPlatform(): boolean {
	return (
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.platform)
	);
}

/** The current binding of a command: the saved one, or its default. "" means none. */
export function commandBinding(id: string): string {
	return (settings.get as (key: string) => string)(shortcutKey(id));
}

let recording = false;
/** While a new shortcut is being recorded, no command may fire. */
export function setRecordingShortcut(on: boolean): void {
	recording = on;
}

/** Whether a key event triggers the command, with its current binding. */
export function commandMatches(
	event: KeyEventLike,
	id: string,
	mac: boolean = isMacPlatform(),
): boolean {
	return !recording && matchesBinding(event, commandBinding(id), mac);
}

/** The key hint for a button, such as `Cmd K`; empty if the command has no binding. */
export function commandHint(
	id: string,
	mac: boolean = isMacPlatform(),
): string {
	return hintKeys(commandBinding(id), mac);
}
