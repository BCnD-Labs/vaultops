import {
	GitCompareArrows,
	Link2,
	ListTree,
	type LucideIcon,
	PencilLine,
	SlidersHorizontal,
	Tags,
} from "lucide-react";
import {
	type ComponentProps,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OutlineItem } from "../core/notes/outline";
import { ShellNavigation } from "./AppShell";
import { LinkedFromPanel } from "./LinkedFromPanel";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { PlannerPanel } from "./planner/PlannerPanel";
import type { NoteRow } from "./session";
import { TagIndex } from "./TagBrowser";

const TOOLS: [string, string, LucideIcon][] = [
	["properties", "Properties", SlidersHorizontal],
	["outline", "Outline", ListTree],
	["links", "Linked from", Link2],
	["tags", "Tags", Tags],
	["changes", "Changes", GitCompareArrows],
	["planner", "Planner", PencilLine],
];

const TAB_KEY = "vaultops:note-tools-tab";
function loadTab() {
	try {
		const saved = localStorage.getItem(TAB_KEY);
		return saved === "changes" ||
			saved === "outline" ||
			saved === "links" ||
			saved === "tags" ||
			saved === "planner"
			? saved
			: "properties";
	} catch {
		return "properties";
	}
}

export function NoteTools({
	hasNote,
	notes = [],
	activeTag = null,
	outline = [],
	linkedFrom = [],
	onOpenNote = () => {},
	...properties
}: ComponentProps<typeof PropertiesPanel> & {
	hasNote: boolean;
	/** Vault notes, used to list tags and counts in the Tags tool. */
	notes?: NoteRow[];
	/** Tag currently filtering the left sidebar tree, if any. */
	activeTag?: string | null;
	outline?: OutlineItem[];
	/** Notes and canvases that link to the open note. */
	linkedFrom?: NoteRow[];
	onOpenNote?: (path: string) => void;
}) {
	const [tab, setTab] = useState(loadTab);
	const panel = useRef<HTMLElement>(null);
	const { changes, planner, propertyRequest, tags, toolsVisible } =
		useContext(ShellNavigation);
	useEffect(() => {
		if (!tags) return;
		setTab("tags");
		try {
			localStorage.setItem(TAB_KEY, "tags");
		} catch {
			/* Storage is optional. */
		}
	}, [tags]);
	useEffect(() => {
		if (!changes) return;
		setTab("changes");
		try {
			localStorage.setItem(TAB_KEY, "changes");
		} catch {
			/* Storage is optional. */
		}
	}, [changes]);
	useEffect(() => {
		if (!planner) return;
		setTab("planner");
		try {
			localStorage.setItem(TAB_KEY, "planner");
		} catch {
			/* Storage is optional. */
		}
	}, [planner]);
	useEffect(() => {
		if (!propertyRequest) return;
		setTab("properties");
		try {
			localStorage.setItem(TAB_KEY, "properties");
		} catch {
			/* Storage is optional. */
		}
	}, [propertyRequest]);
	useEffect(() => {
		if (!propertyRequest || tab !== "properties" || !toolsVisible) return;
		// Radix mounts the tab content after the tab changes.
		const frame = requestAnimationFrame(() => {
			const row = Array.from(
				panel.current?.querySelectorAll<HTMLElement>("[data-property]") ?? [],
			).find((element) => element.dataset.property === propertyRequest.name);
			const target =
				row?.querySelector<HTMLElement>("input:not(:disabled)") ??
				row ??
				panel.current;
			target?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [propertyRequest, tab, toolsVisible]);
	return (
		<Tabs
			value={tab}
			onValueChange={(value) => {
				setTab(value);
				try {
					localStorage.setItem(TAB_KEY, value);
				} catch {
					/* Storage may be unavailable. */
				}
			}}
		>
			{/* The same header row as the left sidebar: a bold title, icon buttons,
			    and room at the end for the floating toggle. */}
			<header className="sidebar-header sidebar-header-last">
				<strong className="sidebar-title">
					{TOOLS.find(([id]) => id === tab)?.[1] ?? "Details"}
				</strong>
				<TabsList aria-label="Note details" className="sidebar-tabs">
					{TOOLS.map(([id, label, Icon]) => (
						<TabsTrigger key={id} value={id} aria-label={label} title={label}>
							<Icon aria-hidden="true" />
						</TabsTrigger>
					))}
				</TabsList>
			</header>
			<TabsContent value="properties">
				{hasNote ? (
					<section ref={panel} tabIndex={-1} aria-label="Note properties">
						<PropertiesPanel {...properties} />
					</section>
				) : (
					<p>Open a note to see its properties.</p>
				)}
			</TabsContent>
			<TabsContent value="outline">
				{hasNote ? (
					<OutlinePanel items={outline} />
				) : (
					<p>Open a note to see its outline.</p>
				)}
			</TabsContent>
			<TabsContent value="links">
				{hasNote ? (
					<LinkedFromPanel rows={linkedFrom} onOpen={onOpenNote} />
				) : (
					<p>Open a note to see what links to it.</p>
				)}
			</TabsContent>
			<TabsContent value="tags">
				<TagIndex
					rows={notes}
					active={activeTag}
					onPick={properties.onOpenTag}
				/>
				{notes.every((note) => note.tags.length === 0) && <p>No tags yet.</p>}
			</TabsContent>
			<TabsContent value="planner">
				<PlannerPanel />
			</TabsContent>
			<TabsContent value="changes">
				<p>Commit, history and sync arrive soon.</p>
				<p>No changes to show yet.</p>
			</TabsContent>
		</Tabs>
	);
}
