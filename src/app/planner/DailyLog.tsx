import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	type LinkRef,
	type LinkTarget,
	searchTargets,
} from "../../core/links/links";
import type { Note } from "../../core/note-format";
import type {
	CheckInConfig,
	CheckInDraft,
	CheckInSlot,
} from "../../core/planner/check-in";
import { addDaysToKey } from "../../core/planner/dates";
import { LOG_PROMPTS, MAX_SECTIONS, readLog } from "../../core/planner/log";
import { CheckIns } from "./CheckIns";
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
	linkTargets = [],
	onOpenLink,
	checkIns,
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
		links?: LinkRef[],
	) => Promise<void>;
	onAddSection: (day: string, name: string) => Promise<void>;
	onOpen: (day: string) => void;
	/** Changes when the vault was reloaded, so the log is read again. */
	version: number;
	/** Notes and tasks an entry can link to. Without any, linking is hidden. */
	linkTargets?: LinkTarget[];
	onOpenLink?: (link: LinkRef) => void;
	/** Daily check-ins (which slots are on, when they start, how to save). Without it none show. */
	checkIns?: {
		config: CheckInConfig;
		save: (
			day: string,
			slot: CheckInSlot,
			draft: CheckInDraft,
		) => Promise<void>;
		/** The time of day, for choosing the current slot. Defaults to now. */
		now?: Date;
	};
}) {
	const [note, setNote] = useState<Note | null>(null);
	const [section, setSection] = useState<string>("main");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [linkDrafts, setLinkDrafts] = useState<Record<string, LinkRef[]>>({});
	const [picking, setPicking] = useState(false);
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
	const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (statusTimer.current) clearTimeout(statusTimer.current);
		},
		[],
	);
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
	const pending = linkDrafts[draftKey] ?? [];
	const setPending = (links: LinkRef[]) =>
		setLinkDrafts((d) => ({ ...d, [draftKey]: links }));
	const choices = picking
		? searchTargets(linkTargets, query, "all", 5).filter(
				(t) => !pending.some((p) => p.target === t.target),
			)
		: [];
	const save = async () => {
		setError(null);
		setStatus("saving");
		try {
			if (pending.length > 0) await onAddEntry(date, sectionId, draft, pending);
			else await onAddEntry(date, sectionId, draft);
			setDraft("");
			setPending([]);
			setPicking(false);
			setQuery("");
			setStatus("saved");
			if (statusTimer.current) clearTimeout(statusTimer.current);
			statusTimer.current = setTimeout(() => setStatus("idle"), 3000);
		} catch (e) {
			setStatus("idle");
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
				<h2>Daily log</h2>
				<span className="plan-sub">{fmtLong(date)}</span>
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
			{checkIns && (
				<CheckIns
					config={checkIns.config}
					note={note}
					day={date}
					isToday={date === today}
					now={checkIns.now ?? new Date()}
					writable={writable}
					onSave={checkIns.save}
				/>
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
						{writable && linkTargets.length > 0 && (
							<Button
								variant="ghost"
								size="sm"
								aria-expanded={picking}
								onClick={() => setPicking((on) => !on)}
							>
								Link
							</Button>
						)}
						{writable && sections.length - 1 < MAX_SECTIONS && !naming && (
							<Button variant="ghost" size="sm" onClick={() => setNaming(true)}>
								<Plus /> Section
							</Button>
						)}
					</div>
					<span className="log-status" role="status">
						{status === "saving"
							? "Saving…"
							: status === "saved"
								? "Entry saved"
								: ""}
					</span>
					{draft.trim() !== "" && (
						<Button
							size="sm"
							disabled={status === "saving"}
							onClick={() => void save()}
						>
							Save entry
						</Button>
					)}
				</div>
				{picking && (
					<div className="log-link-pick">
						<input
							aria-label="Find a note or task to link"
							placeholder="Find a note or task"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<div className="log-links">
							{choices.map((t) => (
								<button
									key={t.target}
									type="button"
									className="note-link-chip"
									onClick={() => {
										setPending([...pending, t]);
										setQuery("");
									}}
								>
									{t.label}
									{t.hint ? ` (${t.hint})` : ""}
								</button>
							))}
						</div>
					</div>
				)}
				{pending.length > 0 && (
					<div className="log-links">
						{pending.map((l) => (
							<button
								key={l.target}
								type="button"
								className="note-link-chip"
								aria-label={`Remove link to ${l.label}`}
								onClick={() => setPending(pending.filter((p) => p !== l))}
							>
								{l.label} ×
							</button>
						))}
					</div>
				)}
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
							<li key={e.id}>
								{e.text}
								{e.links.length > 0 && (
									<span className="log-links">
										{e.links.map((l) => (
											<button
												key={l.target}
												type="button"
												className="note-link-chip"
												onClick={() => onOpenLink?.(l)}
											>
												{linkTargets.find((t) => t.target === l.target)
													?.label ?? l.label}
											</button>
										))}
									</span>
								)}
							</li>
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
