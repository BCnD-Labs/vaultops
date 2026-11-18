import { describe, expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { openVault } from "../vault/vault";
import { withProps } from "./properties";
import { createNote, loadNote, saveNote } from "./repository";
import {
	checkTagRename,
	planTagRename,
	renameTagInProps,
	renameTagList,
	renameTagOnDisk,
} from "./tag-rename";
import { tagsOf } from "./tags";

describe("renameTagList", () => {
	it("renames the tag and all descendants, keeping their endings", () => {
		expect(
			renameTagList(
				["work/clients", "work/clients/Acme", "work/other"],
				"work/clients",
				"clients",
			),
		).toEqual(["clients", "clients/Acme", "work/other"]);
	});

	it("merges into an existing tag without duplicates", () => {
		expect(renameTagList(["old", "New", "x"], "old", "new")).toEqual([
			"New",
			"x",
		]);
		expect(renameTagList(["a/x", "b/x"], "a", "b")).toEqual(["b/x"]);
	});

	it("is null when nothing changes and does not touch look-alikes", () => {
		expect(renameTagList(["workshop"], "work", "job")).toBeNull();
		expect(renameTagList(["idea"], "IDEA", "idea")).toBeNull();
	});

	it("checks the new name", () => {
		expect(checkTagRename("a", " b / c ")).toEqual({ ok: true, to: "b/c" });
		expect(checkTagRename("a", " / ").ok).toBe(false);
		expect(checkTagRename("a", "a").ok).toBe(false);
	});
});

describe("renaming across the vault", () => {
	async function vaultWith(tagsByTitle: Record<string, string[]>) {
		const host = new MemoryHost();
		await openVault(host);
		for (const [title, tags] of Object.entries(tagsByTitle)) {
			const made = await createNote(host, "", title);
			await saveNote(host, made.path, {
				...made.note,
				header: withProps(made.note.header, {
					tags: { type: "list", value: tags },
				}),
			});
		}
		return host;
	}
	const tagsAt = async (host: MemoryHost, path: string) => {
		const note = (await loadNote(host, path)).note;
		return tagsOf((note?.header.props as never) ?? null);
	};

	it("plans which notes change and which are read-only", () => {
		const plan = planTagRename(
			[
				{ path: "a", tags: ["work/x"], readOnly: false },
				{ path: "b", tags: ["work"], readOnly: true },
				{ path: "c", tags: ["other"] },
			],
			"work",
			"job",
		);
		expect(plan).toEqual({ paths: ["a"], readOnly: ["b"] });
	});

	it("rewrites every affected note on disk, merging duplicates", async () => {
		const host = await vaultWith({
			A: ["work/clients", "work/clients/acme"],
			B: ["clients", "work/clients"],
			C: ["idea"],
		});
		const result = await renameTagOnDisk(
			host,
			["A.vnote", "B.vnote"],
			"work/clients",
			"clients",
		);
		expect(result).toEqual({ changed: 2, problems: [] });
		expect(await tagsAt(host, "A.vnote")).toEqual(["clients", "clients/acme"]);
		expect(await tagsAt(host, "B.vnote")).toEqual(["clients"]);
		expect(await tagsAt(host, "C.vnote")).toEqual(["idea"]);
	});

	it("reports a note it cannot read and carries on with the rest", async () => {
		const host = await vaultWith({ A: ["x"] });
		const result = await renameTagOnDisk(
			host,
			["Missing.vnote", "A.vnote"],
			"x",
			"y",
		);
		expect(result.changed).toBe(1);
		expect(result.problems).toHaveLength(1);
		expect(await tagsAt(host, "A.vnote")).toEqual(["y"]);
	});

	it("props helper leaves notes without the tag alone", () => {
		expect(renameTagInProps({}, "a", "b")).toBeNull();
	});
});
