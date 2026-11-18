import { expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import { loadPins, PIN_FILE, placePin, prunePins, savePin } from "./pins";
import { renameNote } from "./rename";
import { createNote, loadNote } from "./repository";

it("pins, reorders, unpins and prunes", () => {
	const pins = placePin(["a"], "b", 1);
	expect(pins).toEqual(["a", "b"]);
	expect(placePin(pins, "b", 0)).toEqual(["b", "a"]);
	expect(placePin(pins, "a", null)).toEqual(["b"]);
	expect(prunePins(["missing", "a", "a"], new Set(pins))).toEqual(["a"]);
});

it("keeps a renamed note pinned, preserves unknown fields and drops missing ids", async () => {
	const host = new MemoryHost();
	await openVault(host);
	const { path, note } = await createNote(host, "", "Old");
	const id = note.header.noteId;
	await host.writeTextAtomic(
		PIN_FILE,
		JSON.stringify({ version: 1, extra: 42, pins: ["missing"] }),
	);
	await savePin(host, new Set([id]), id, 0);
	const renamed = await renameNote(host, path, note, "New");
	const loaded = await loadNote(host, renamed.path);
	expect(await loadPins(host)).toEqual([loaded.note?.header.noteId]);
	expect(JSON.parse(await host.readText(PIN_FILE)).extra).toBe(42);
});

it("recovers damaged data before replacement and refuses future versions", async () => {
	const host = new MemoryHost();
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(PIN_FILE, "broken");
	const { recoveryPath } = await savePin(host, new Set(["a"]), "a", 0);
	expect(await host.readText(recoveryPath ?? "")).toBe("broken");
	expect(await loadPins(host)).toEqual(["a"]);
	await host.writeTextAtomic(PIN_FILE, '{"version":2}');
	await expect(savePin(host, new Set(), "a", null)).rejects.toThrow("newer");
	expect(await host.readText(PIN_FILE)).toBe('{"version":2}');
});
