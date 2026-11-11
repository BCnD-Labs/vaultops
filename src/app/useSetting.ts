import { useSyncExternalStore } from "react";
import { shortcutKey } from "../core/settings/shortcuts";
import { settings } from "./settings";
import { commandHint } from "./shortcuts";

type Settings = typeof settings;
type Key = Parameters<Settings["get"]>[0];

const subscribe = (onChange: () => void) =>
	settings.subscribe(() => onChange());

/** A setting's current value; the component redraws when it changes. */
export function useSetting<K extends Key>(
	key: K,
): ReturnType<typeof settings.get<K>> {
	const read = () => settings.get(key);
	return useSyncExternalStore(subscribe, read, read);
}

/** The key hint for a command, such as `Cmd K`; redraws when it is rebound. */
export function useCommandHint(id: string): string {
	useSetting(shortcutKey(id) as Key);
	return commandHint(id);
}
