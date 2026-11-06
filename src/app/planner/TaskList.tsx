import { ListChecks, Plus, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
	inTab,
	type PlannerTask,
	parseQuickAdd,
	TASK_TABS,
	type TaskTab,
	taskGroups,
	taskRows,
} from "../../core/planner/rules";
import { useAppearance } from "../AppearanceContext";
import { tagTone } from "../appearance";
import { fmtShort } from "./fmt";

export function Labels({ labels }: { labels: string[] }) {
	const { appearance } = useAppearance();
	return (
		<>
			{labels.map((l) => (
				<span key={l} className="tag-pill" data-tone={tagTone(l, appearance)}>
					{l}
				</span>
			))}
		</>
	);
}

export function TaskRow({
	task,
	today,
	selected,
	disabled,
	onSelect,
	onToggle,
}: {
	task: PlannerTask;
	today: string;
	selected: boolean;
	disabled: boolean;
	onSelect: (t: PlannerTask) => void;
	onToggle: (t: PlannerTask) => void;
}) {
	const done = task.status === "closed";
	const overdue = !done && !!task.due && task.due < today;
	return (
		<li
			className={cn("plan-row", selected && "is-selected", done && "is-done")}
		>
			<Checkbox
				checked={done}
				disabled={disabled}
				aria-label={done ? `Reopen ${task.title}` : `Close ${task.title}`}
				onCheckedChange={() => onToggle(task)}
			/>
			<button
				type="button"
				className="plan-row-main"
				onClick={() => onSelect(task)}
			>
				{task.number > 0 && <span className="plan-num">#{task.number}</span>}
				<span className="plan-title">{task.title}</span>
				<Labels labels={task.labels} />
				{task.due && (
					<span className={cn("plan-due", overdue && "is-overdue")}>
						{overdue ? "Overdue · " : ""}
						{fmtShort(task.due)}
						{task.dueTime ? ` ${task.dueTime}` : ""}
					</span>
				)}
			</button>
			{task.starred && <Star className="plan-star" aria-label="Starred" />}
		</li>
	);
}

/** Today / Next / All / Done, with search, starred filter and a quick-add line. */
export function TaskList({
	tasks,
	today,
	selected,
	writable,
	onSelect,
	onToggle,
	onQuickAdd,
}: {
	tasks: PlannerTask[];
	today: string;
	selected: string | null;
	writable: boolean;
	onSelect: (t: PlannerTask) => void;
	onToggle: (t: PlannerTask) => Promise<void>;
	onQuickAdd: (title: string, due?: string) => Promise<void>;
}) {
	const [tab, setTab] = useState<TaskTab>("today");
	const [query, setQuery] = useState("");
	const [searching, setSearching] = useState(false);
	const [starredOnly, setStarredOnly] = useState(false);
	const [lingering, setLingering] = useState<Set<string>>(new Set());
	const [draft, setDraft] = useState("");
	const rows = useMemo(
		() => taskRows(tasks, { tab, today, query, starredOnly, lingering }),
		[tasks, tab, today, query, starredOnly, lingering],
	);
	const groups = taskGroups(rows, { tab, today, lingering });
	const count = (t: TaskTab) => tasks.filter((x) => inTab(x, t, today)).length;
	const toggle = async (t: PlannerTask) => {
		if (t.status === "open") setLingering((s) => new Set(s).add(t.path));
		await onToggle(t);
	};
	const add = async () => {
		const { title, due } = parseQuickAdd(draft, today);
		if (!title) return;
		await onQuickAdd(title, due);
		setDraft("");
	};
	return (
		<section className="plan-card" aria-label="Tasks">
			<header className="plan-card-head">
				<h2>Tasks</h2>
				<div className="plan-actions">
					<Button
						variant="ghost"
						size="icon"
						aria-label="Search tasks"
						aria-pressed={searching}
						onClick={() => {
							setSearching(!searching);
							if (searching) setQuery("");
						}}
					>
						<Search />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Starred only"
						aria-pressed={starredOnly}
						onClick={() => setStarredOnly(!starredOnly)}
					>
						<Star className={cn(starredOnly && "plan-star-on")} />
					</Button>
				</div>
			</header>
			<Tabs
				value={tab}
				onValueChange={(v) => {
					setTab(v as TaskTab);
					setLingering(new Set());
				}}
			>
				<TabsList aria-label="Task views">
					{TASK_TABS.map((t) => (
						<TabsTrigger key={t.value} value={t.value}>
							{t.label}
							{t.value !== "done" && (
								<span className="plan-count">{count(t.value)}</span>
							)}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>
			{searching && (
				<Input
					className="plan-search"
					autoFocus
					aria-label="Search tasks"
					placeholder="Search title, text, labels, or #12"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			)}
			<form
				className="plan-quick"
				onSubmit={(e) => {
					e.preventDefault();
					void add();
				}}
			>
				<Plus aria-hidden />
				<Input
					aria-label="Add a task"
					placeholder="Add a task, e.g. “Call dentist fri”"
					value={draft}
					disabled={!writable}
					onChange={(e) => setDraft(e.target.value)}
				/>
			</form>
			<div className="plan-list">
				{rows.length === 0 ? (
					<p className="plan-empty">
						<ListChecks aria-hidden />
						{query || starredOnly
							? "No tasks match."
							: {
									today: "Nothing due today.",
									next: "Nothing scheduled.",
									all: "No open tasks.",
									done: "Nothing closed yet.",
								}[tab]}
					</p>
				) : (
					groups.map((g) => (
						<section key={g.name ?? "done"} aria-label={g.name ?? "Closed"}>
							{g.name && (tab !== "today" || groups.length > 1) && (
								<h3
									className={cn(
										"plan-group",
										g.name === "Overdue" && "is-overdue",
									)}
								>
									{g.name} <span>· {g.items.length}</span>
								</h3>
							)}
							<ul>
								{g.items.map((t) => (
									<TaskRow
										key={t.path}
										task={t}
										today={today}
										selected={selected === t.path}
										disabled={!writable}
										onSelect={onSelect}
										onToggle={toggle}
									/>
								))}
							</ul>
						</section>
					))
				)}
			</div>
		</section>
	);
}
