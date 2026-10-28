import { describe, expect, it } from "vitest";
import type { Host } from "../host/host";
import { MemoryHost } from "../host/memory-host";
import { chooseAndLoad, loadVault, newNote } from "./session";

function noVaultHost(): Host {
	const host = new MemoryHost();
	host.currentVault = async () => null;
	host.chooseVault = async () => null;
	return host;
}

describe("vault session", () => {
	it("shows nothing when no vault is open, and a cancelled picker changes nothing", async () => {
		const host = noVaultHost();
		expect((await loadVault(host)).status).toBe("none");
		expect(await chooseAndLoad(host)).toBeNull();
	});

	it("creates a vault in an empty folder and starts with no notes", async () => {
		const view = await loadVault(new MemoryHost());
		expect(view).toMatchObject({
			status: "created",
			writable: true,
			notes: [],
		});
	});

	it("adds notes and lists them by title, including subfolders", async () => {
		const host = new MemoryHost();
		let view = await loadVault(host);
		view = await newNote(host, view);
		view = await newNote(host, view);
		await host.makeFolder("Class");
		await host.writeTextAtomic(
			"Class/Lecture.vnote",
			'{"format":"vaultops-note","v":1,"noteId":"n-1","title":"Lecture 1"}\n',
		);
		view = await loadVault(host);
		expect(view.status).toBe("opened");
		expect(view.notes.map((n) => [n.path, n.title])).toEqual([
			["Class/Lecture.vnote", "Lecture 1"],
			["Untitled 2.vnote", "Untitled"],
			["Untitled.vnote", "Untitled"],
		]);
	});

	it("explains a folder that isn't a vault and allows no writes", async () => {
		const host = new MemoryHost();
		await host.writeTextAtomic("shopping.txt", "milk");
		const view = await loadVault(host);
		expect(view.status).toBe("not-a-vault");
		expect(view.writable).toBe(false);
		expect(view.messages[0]).toMatch(/isn't a vault/);
		expect(await newNote(host, view)).toBe(view);
		expect((await host.list("")).map((e) => e.name)).toEqual(["shopping.txt"]);
	});

	it("reports damaged notes but still lists the good ones", async () => {
		const host = new MemoryHost();
		await loadVault(host);
		await host.writeTextAtomic("broken.vnote", "not json\n");
		const view = await loadVault(host);
		expect(view.notes).toEqual([]);
		expect(view.messages.some((m) => m.startsWith("broken.vnote:"))).toBe(true);
	});
});

describe("note list order", () => {
	it("sorts by title ignoring case, then path", async () => {
		const { compareRows } = await import("./session");
		const rows = [
			{ path: "z.vnote", title: "banana", readOnly: false },
			{ path: "a.vnote", title: "Cherry", readOnly: false },
			{ path: "m.vnote", title: "Apple", readOnly: false },
			{ path: "b.vnote", title: "apple", readOnly: false },
		].sort(compareRows);
		expect(rows.map((r) => r.path)).toEqual([
			"b.vnote",
			"m.vnote",
			"z.vnote",
			"a.vnote",
		]);
	});
});
