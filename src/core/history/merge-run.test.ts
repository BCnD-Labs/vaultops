import { expect, it } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import { parseNote } from "../note-format";
import { blockText } from "./diff";
import { runBranchMerge } from "./merge-run";

const note = (title: string, blocks: [string, string][]) =>
	[
		JSON.stringify({
			format: "vaultops-note",
			v: 1,
			noteId: `id-${title}`,
			title,
		}),
		...blocks.map(([id, text]) =>
			JSON.stringify({
				id,
				type: "paragraph",
				parent: null,
				content: [{ type: "text", text }],
			}),
		),
	].join("\n") + "\n";

const texts = async (host: MemoryHost, path: string) =>
	(parseNote(await host.readText(path)).note?.blocks ?? []).map(blockText);

async function diverged() {
	const host = new MemoryHost();
	await host.writeTextAtomic(
		"Essay.vnote",
		note("Essay", [
			["a", "Intro"],
			["b", "Body"],
		]),
	);
	await host.writeTextAtomic("Clash.vnote", note("Clash", [["c", "Draft"]]));
	await host.makeFolder(".vaultops");
	await host.writeTextAtomic(".vaultops/pinned.json", '["a"]');
	await host.vcs.enable("Sam");
	await host.vcs.createBranch("try-out", true);
	await host.writeTextAtomic(
		"Essay.vnote",
		note("Essay", [
			["a", "Intro"],
			["b", "Better body"],
			["t", "Their new part"],
		]),
	);
	await host.writeTextAtomic(
		"Clash.vnote",
		note("Clash", [["c", "Their draft"]]),
	);
	await host.writeTextAtomic(".vaultops/pinned.json", '["t"]');
	await host.vcs.savePoint("try-out work");
	await host.vcs.switchBranch("main");
	await host.writeTextAtomic(
		"Essay.vnote",
		note("Essay", [
			["a", "Better intro"],
			["b", "Body"],
		]),
	);
	await host.writeTextAtomic("Clash.vnote", note("Clash", [["c", "My draft"]]));
	await host.writeTextAtomic(".vaultops/pinned.json", '["m"]');
	await host.vcs.savePoint("main work");
	return host;
}

it("combines notes block by block, keeps both versions of a clash, and saves theirs of a non-note in recovery", async () => {
	const host = await diverged();
	const report = await runBranchMerge(
		host,
		"try-out",
		new Date("2026-11-24T10:00:00Z"),
	);
	expect(report.upToDate).toBe(false);
	expect(await texts(host, "Essay.vnote")).toEqual([
		"Better intro",
		"Better body",
		"Their new part",
	]);
	expect(await texts(host, "Clash.vnote")).toEqual([
		"My draft",
		"",
		"Also changed on try-out:",
		"Their draft",
	]);
	const byPath = Object.fromEntries(report.outcomes.map((o) => [o.path, o]));
	expect(byPath["Essay.vnote"]).toMatchObject({
		kind: "merged",
		conflicts: [],
	});
	expect(byPath["Clash.vnote"]).toMatchObject({
		kind: "merged",
		conflicts: [{ kind: "block", id: "c" }],
	});
	const pinned = byPath[".vaultops/pinned.json"];
	expect(pinned).toMatchObject({ kind: "kept-mine" });
	expect(await host.readText(".vaultops/pinned.json")).toBe('["m"]');
	expect(
		await host.readText((pinned as { recoveryPath: string }).recoveryPath),
	).toBe('["t"]');
	// Everything is resolved, so the merge can finish.
	const done = await host.vcs.mergeFinish("Merged try-out into main");
	expect(done.merging).toBe(false);
});

it("reports up to date when there is nothing to merge, and a cancelled merge puts everything back", async () => {
	const host = await diverged();
	await runBranchMerge(host, "try-out");
	await host.vcs.mergeAbort();
	expect(await texts(host, "Clash.vnote")).toEqual(["My draft"]);
	await runBranchMerge(host, "try-out");
	await host.vcs.mergeFinish("Merged");
	expect((await runBranchMerge(host, "try-out")).upToDate).toBe(true);
});
