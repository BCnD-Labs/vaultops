import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Note } from "../../core/note-format";
import { addDaysToKey } from "../../core/planner/dates";
import { LOG_PROMPTS, MAX_SECTIONS, readLog } from "../../core/planner/log";
import { fmtLong } from "./fmt";

/**
 * One day's log: the main log plus up to three named sections, shown as tabs. A
 * typed entry is only saved when asked; the draft survives date changes.
 */
export function DailyLog({
	date,
	today,
	writable,
	load,
	onDate,
	onAddEntry,
	onAddSection,
	onOpen,
	version,
}: {
	date: string;
	today: string;
	writable: boolean;
	load: (day: string) => Promise<Note | null>;
	onDate: (d: string) => void;
	onAddEntry: (
		day: string,
		sectionId: string | null,
		text: string,
	) => Promise<void>;
	onAddSection: (day: string, name: string) => Promise<void>;
	onOpen: (day: string) => void;
	/** Changes when the vault was reloaded, so the log is read again. */
	version: number;
}) {
	const [note, setNote] = useState<Note | null>(null);
	const [section, setSection] = useState<string>("main");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the reload signal
	useEffect(() => {
		let live = true;
		load(date).then(
			(n) => live && setNote(n),
			() => live && setNote(null),
		);
		return () => {
			live = false;
		};
	}, [date, load, version]);
	const sections = note
		? readLog(note)
		: readLog({
				header: { format: "vaultops-note", v: 1, noteId: "" },
				blocks: [],
			});
	const current =
		sections.find((s) => (s.id ?? "main") === section) ?? sections[0];
	const sectionId = current?.id ?? null;
	const draftKey = `${date}:${section}`;
	const draft = drafts[draftKey] ?? "";
	const setDraft = useCallback(
		(v: string) => setDrafts((d) => ({ ...d, [draftKey]: v })),
		[draftKey],
	);
	const save = async () => {
		setError(null);
		try {
			await onAddEntry(date, sectionId, draft);
			setDraft("");
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	const addSection = async () => {
		setError(null);
		try {
			await onAddSection(date, name);
			setName("");
			setNaming(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	};
	const prompt = (p: string) => setDraft(draft ? `${draft}\n${p}: ` : `${p}: `);
	return (
		<section className="plan-card plan-log" aria-label="Daily log">
			<header className="plan-card-head">
				<h2>
					Daily log <span className="plan-sub">{fmtLong(date)}</span>
				</h2>
				<div className="plan-actions">
					<Button
						variant="ghost"
						size="icon"
						aria-label="Previous log day"
						onClick={() => onDate(addDaysToKey(date, -1))}
					>
						<ChevronLeft />
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={date === today}
						onClick={() => onDate(today)}
					>
						Today
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Next log day"
						onClick={() => onDate(addDaysToKey(date, 1))}
					>
						<ChevronRight />
					</Button>
				</div>
			</header>
			{sections.length > 1 && (
				<Tabs
					value={current ? (current.id ?? "main") : "main"}
					onValueChange={setSection}
				>
					<TabsList aria-label="Log sections">
						{sections.map((s) => (
							<TabsTrigger key={s.id ?? "main"} value={s.id ?? "main"}>
								{s.name}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			)}
			<div className="plan-log-body">
				<Textarea
					aria-label={`Log entry for ${date}`}
					placeholder="What happened? A few lines are enough."
					value={draft}
					disabled={!writable}
					onChange={(e) => setDraft(e.target.value)}
				/>
				<div className="plan-log-bar">
					<div className="plan-prompts">
						{LOG_PROMPTS.map((p) => (
							<Button
								key={p}
								variant="ghost"
								size="sm"
								disabled={!writable}
								onClick={() => prompt(p)}
							>
								+ {p}
							</Button>
						))}
						{writable && sections.length - 1 < MAX_SECTIONS && !naming && (
							<Button variant="ghost" size="sm" onClick={() => setNaming(true)}>
								<Plus /> Section
							</Button>
						)}
					</div>
					{draft.trim() !== "" && (
						<Button size="sm" onClick={() => void save()}>
							Save entry
						</Button>
					)}
				</div>
				{naming && (
					<form
						className="plan-naming"
						onSubmit={(e) => {
							e.preventDefault();
							void addSection();
						}}
					>
						<input
							aria-label="Section name"
							placeholder="Section name, e.g. Evening"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
						<Button size="sm" type="submit" disabled={!name.trim()}>
							Add
						</Button>
						<Button
							size="sm"
							variant="ghost"
							type="button"
							onClick={() => {
								setNaming(false);
								setName("");
							}}
						>
							Cancel
						</Button>
					</form>
				)}
				{error && (
					<p role="alert" className="plan-error">
						{error}
					</p>
				)}
				{current && current.entries.length > 0 ? (
					<ul className="plan-entries">
						{current.entries.map((e) => (
							<li key={e.id}>{e.text}</li>
						))}
					</ul>
				) : (
					<p className="plan-empty">Nothing logged here yet.</p>
				)}
				{note && (
					<Button variant="ghost" size="sm" onClick={() => onOpen(date)}>
						Open day as a note
					</Button>
				)}
			</div>
		</section>
	);
}
