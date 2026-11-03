import { afterEach, expect, it, vi } from "vitest";
import { noteSections } from "./note-sections";

afterEach(() => vi.unstubAllGlobals());
it("saves collapsed folder paths per vault and validates stored data", () => {
	const setItem = vi.fn();
	vi.stubGlobal("localStorage", { getItem: () => '["", "Work"]', setItem });
	expect(noteSections("Vault")).toEqual(["", "Work"]);
	expect(noteSections("Vault", ["Work"])).toEqual(["Work"]);
	expect(setItem).toHaveBeenCalledWith(
		"vaultops:note-sections:Vault",
		'["Work"]',
	);
	for (const invalid of ["{}", "[1]", "null", "broken"]) {
		vi.stubGlobal("localStorage", { getItem: () => invalid });
		expect(noteSections("Vault")).toEqual([]);
	}
});
it("keeps toggling usable when storage access, reads or writes fail", () => {
	for (const storage of [
		undefined,
		{
			getItem: () => {
				throw new Error("blocked");
			},
			setItem: () => {
				throw new Error("full");
			},
		},
	]) {
		vi.stubGlobal("localStorage", storage);
		expect(noteSections("Vault")).toEqual([]);
		expect(noteSections("Vault", ["Work"])).toEqual(["Work"]);
	}
});
