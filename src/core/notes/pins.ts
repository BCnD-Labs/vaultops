import type { Host } from "../../host/host";
import { copyToRecovery } from "./trash";

export const PIN_FILE = ".vaultops/pinned.json";
type PinFile = { version: number; pins: string[]; [key: string]: unknown };

async function readPins(host: Host) {
	if ((await host.kindOf(PIN_FILE)) === null) return { pins: [] };
	const text = await host.readText(PIN_FILE);
	let data: PinFile | null = null;
	try {
		data = JSON.parse(text);
	} catch {
		/* Keep the original for recovery. */
	}
	if (data && data.version > 1)
		throw new Error("Pinned notes belong to a newer app version.");
	if (
		data?.version === 1 &&
		Array.isArray(data.pins) &&
		data.pins.every((id) => typeof id === "string")
	)
		return { data, pins: data.pins };
	return { damaged: text, pins: [] };
}

export async function loadPins(host: Host) {
	return (await readPins(host)).pins;
}

export function prunePins(pins: string[], existing: Set<string>) {
	return [...new Set(pins)].filter((id) => existing.has(id));
}

/** Null removes the pin. A number places it at that position in the list. */
export function placePin(pins: string[], id: string, index: number | null) {
	const next = pins.filter((pin) => pin !== id);
	if (index !== null) next.splice(index, 0, id);
	return next;
}

export async function savePin(
	host: Host,
	existing: Set<string>,
	id: string,
	index: number | null,
) {
	const previous = await readPins(host);
	const pins = prunePins(
		placePin(prunePins(previous.pins, existing), id, index),
		existing,
	);
	await host.makeFolder(".vaultops");
	const recovered =
		previous.damaged === undefined
			? undefined
			: await copyToRecovery(host, previous.damaged, "pinned.json");
	await host.writeTextAtomic(
		PIN_FILE,
		JSON.stringify({ ...previous.data, version: 1, pins }, null, 2) + "\n",
	);
	return { pins, recoveryPath: recovered?.recoveryPath };
}
