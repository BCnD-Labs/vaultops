import { expect, it } from "vitest";
import { compileRule, type MatchRow } from "./match";
import { normalizeRule, normalizeSort } from "./rule";
import { sortRows } from "./sort";

const STATUS = ["Open", "Reading", "Done", "Paused"];
const two = (n: number) => String(n + 1).padStart(2, "0");

function vault(size: number): MatchRow[] {
	return Array.from({ length: size }, (_, i) => ({
		path: `Folder ${i % 40}/Note ${i}`,
		id: `id-${i}`,
		title: `Note ${i}`,
		tags: [`area/${i % 12}`, ...(i % 3 === 0 ? ["reading"] : [])],
		links: [`id-${(i * 7) % size}`],
		...(i % 5 === 0 ? { type: "book" } : {}),
		fields: {
			status: { name: "Status", type: "select", value: STATUS[i % 4] ?? "" },
			pages: { name: "Pages", type: "number", value: (i * 37) % 900 },
			due: {
				name: "Due",
				type: "date",
				value: `2026-${two(i % 12)}-${two(i % 28)}`,
			},
			author: { name: "Author", type: "text", value: `Author ${i % 300}` },
		},
	}));
}

/** Twenty views of five conditions each, every one sorted. */
const views = Array.from({ length: 20 }, (_, v) => ({
	rule: normalizeRule({
		match: v % 2 === 0 ? "all" : "any",
		conditions: [
			{ field: "folder", op: "in", value: `Folder ${v}` },
			{ field: "tag", op: "has", value: `area/${v % 12}` },
			{ field: "prop:Status", op: "oneOf", value: ["Reading", "Open"] },
			{ field: "prop:Pages", op: "gt", value: v * 20 },
			{ field: "prop:Due", op: "after", value: "2026-03-01" },
		],
	}),
	sort: normalizeSort([{ field: "prop:Due", dir: "desc" }, { field: "title" }]),
}));

// About 25 ms on an idle Mac. The budget is loose on purpose: a busy machine
// (or a shared CI runner) can be several times slower, and the test is only
// here to catch a real regression, like a per-row vault read or re-parse,
// which costs ten times or more.
const BUDGET_MS = 400;

it("evaluates 20 views over 10,000 notes within the budget", () => {
	const rows = vault(10_000);
	const run = () => {
		let shown = 0;
		for (const view of views) {
			const test = compileRule(view.rule, { today: "2026-11-18" });
			shown += sortRows(rows.filter(test), view.sort, 200).length;
		}
		return shown;
	};
	run(); // warm up
	let best = Number.POSITIVE_INFINITY;
	for (let i = 0; i < 3; i++) {
		const start = performance.now();
		expect(run()).toBeGreaterThan(0);
		best = Math.min(best, performance.now() - start);
	}
	expect(best).toBeLessThan(BUDGET_MS);
});
