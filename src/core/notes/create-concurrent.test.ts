import { expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { createNote } from "./repository";

it("many quick creations with one title each get their own file", async () => {
	const host = new MemoryHost();
	const made = await Promise.all(
		Array.from({ length: 20 }, () => createNote(host, "", "Same")),
	);
	expect(new Set(made.map((m) => m.path)).size).toBe(20);
	expect(
		(await host.list("")).filter((entry) => entry.name.startsWith("Same"))
			.length,
	).toBe(20);
});

it("a failed creation does not block the ones after it", async () => {
	const host = new MemoryHost();
	await expect(createNote(host, ".vaultops", "Nope")).rejects.toThrow();
	const ok = await createNote(host, "", "Fine");
	expect(ok.path).toContain("Fine");
});
