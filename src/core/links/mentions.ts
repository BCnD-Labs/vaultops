export interface MentionNote {
	path: string;
	id?: string;
	title: string;
	text?: string;
	links?: readonly string[];
	kind?: "note" | "canvas";
}

export interface GraphNode {
	id: string;
	path: string;
	title: string;
	kind: "note" | "canvas";
	hop: 0 | 1 | 2;
	x: number;
	y: number;
}

const WORD = /[\p{L}\p{N}]/u;
const clean = (s: string) =>
	s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const byTitle = (a: MentionNote, b: MentionNote) =>
	a.title.localeCompare(b.title, undefined, { sensitivity: "base" });

/** First whole-word, case- and accent-insensitive span `[from, to]` of `title` (3+ chars) in `text`. */
export function findMentionSpan(
	text: string,
	title: string,
): [number, number] | null {
	const needle = clean(title.trim().replace(/\s+/g, " "));
	if (needle.length < 3) return null;
	let hay = "";
	const start: number[] = [];
	const end: number[] = [];
	for (let i = 0; i < text.length; ) {
		const step = (text.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
		for (const ch of clean(text.slice(i, i + step))) {
			hay += ch;
			start.push(i);
			end.push(i + step);
		}
		i += step;
	}
	const wStart = WORD.test(needle[0] ?? "");
	const wEnd = WORD.test(needle[needle.length - 1] ?? "");
	for (
		let at = hay.indexOf(needle);
		at !== -1;
		at = hay.indexOf(needle, at + 1)
	) {
		const before = at > 0 ? (hay[at - 1] ?? "") : "";
		const after = hay[at + needle.length] ?? "";
		if ((wStart && WORD.test(before)) || (wEnd && WORD.test(after))) continue;
		let to = end[at + needle.length - 1] ?? text.length;
		while (to < text.length && /\p{M}/u.test(text[to] ?? "")) to++;
		return [start[at] ?? 0, to];
	}
	return null;
}

/** Other notes whose text mentions `title` (3+ chars) without already linking to `noteId`. */
export function mentionsOf<T extends MentionNote>(
	notes: readonly T[],
	noteId: string | undefined,
	title: string | undefined,
): { note: T; snippet: string }[] {
	if (!noteId || !title) return [];
	return notes
		.flatMap((note) => {
			if (
				note.id === noteId ||
				note.kind === "canvas" ||
				note.links?.includes(noteId) ||
				!note.text
			)
				return [];
			const span = findMentionSpan(note.text, title);
			if (!span) return [];
			const s = Math.max(0, span[0] - 30);
			const e = Math.min(note.text.length, span[1] + 50);
			const snippet = `${s > 0 ? "…" : ""}${note.text.slice(s, e)}${e < note.text.length ? "…" : ""}`;
			return [{ note, snippet }];
		})
		.sort((a, b) => byTitle(a.note, b.note));
}

/** Force-free local graph around `noteId` (center, 1st-hop ring, 2nd-hop outer ring), capped at `maxNodes`. */
export function localGraph(
	notes: readonly MentionNote[],
	noteId: string | undefined,
	maxNodes = 30,
) {
	const byId = new Map(
		notes.flatMap((n) => (n.id ? [[n.id, { ...n, id: n.id }]] : [])),
	);
	const center = noteId ? byId.get(noteId) : undefined;
	if (!center || maxNodes < 1) return { nodes: [], edges: [] };
	const adj = new Map<string, Set<string>>();
	for (const n of byId.values()) {
		for (const to of n.links ?? []) {
			if (to === n.id || !byId.has(to)) continue;
			adj.set(n.id, (adj.get(n.id) ?? new Set()).add(to));
			adj.set(to, (adj.get(to) ?? new Set()).add(n.id));
		}
	}
	const list = (ids: Iterable<string>) =>
		[...ids].flatMap((id) => byId.get(id) ?? []).sort(byTitle);
	const hop1 = list(adj.get(center.id) ?? []).slice(0, maxNodes - 1);
	const picked = new Set([center.id, ...hop1.map((n) => n.id)]);
	const hop2 = list(
		new Set(
			hop1.flatMap((n) =>
				[...(adj.get(n.id) ?? [])].filter((id) => !picked.has(id)),
			),
		),
	).slice(0, maxNodes - picked.size);
	const ring = (
		items: typeof hop1,
		hop: 0 | 1 | 2,
		r: number,
		shift = 0,
	): GraphNode[] =>
		items.map((n, i) => {
			const a = -Math.PI / 2 + shift + (2 * Math.PI * i) / items.length;
			const kind = n.kind === "canvas" ? "canvas" : "note";
			const x = Math.round((110 + r * Math.cos(a)) * 10) / 10;
			const y = Math.round((110 + r * Math.sin(a)) * 10) / 10;
			return { id: n.id, path: n.path, title: n.title, kind, hop, x, y };
		});
	const nodes = [
		...ring([center], 0, 0),
		...ring(hop1, 1, 52),
		...ring(hop2, 2, 90, Math.PI / Math.max(hop2.length, 6)),
	];
	const placed = new Map(nodes.map((n) => [n.id, n]));
	const seen = new Set<string>();
	const edges = nodes.flatMap((a) =>
		(byId.get(a.id)?.links ?? []).flatMap((to) => {
			const b = placed.get(to);
			const key = a.id < to ? `${a.id}:${to}` : `${to}:${a.id}`;
			if (!b || a.id === to || seen.has(key)) return [];
			seen.add(key);
			return [{ from: a.id, to, x1: a.x, y1: a.y, x2: b.x, y2: b.y }];
		}),
	);
	return { nodes, edges };
}
