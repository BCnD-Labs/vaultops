import {
	GitCompareArrows,
	Highlighter,
	History,
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
import type { Note } from "../core/note-format";
import type { HighlightItem } from "../core/notes/highlights";
import type { OutlineItem } from "../core/notes/outline";
import type { Host } from "../host/host";
import { ShellNavigation } from "./AppShell";
import { HighlightsPanel } from "./HighlightsPanel";
import { LinkedFromPanel } from "./LinkedFromPanel";
import { NoteHistoryPanel } from "./NoteHistoryPanel";
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { PlannerPanel } from "./planner/PlannerPanel";
import type { NoteRow } from "./session";
import { TagIndex } from "./TagBrowser";
import { useFeatures } from "./useFeature";

/** Each tab, with the feature (core/features/registry.ts) that can switch it off. */
const TOOLS: [string, string, LucideIcon, string?][] = [
	["properties", "Properties", SlidersHorizontal, "tab-properties"],
	["outline", "Outline", ListTree, "tab-outline"],
	["highlights", "Highlights", Highlighter, "highlights"],
	["links", "Connections", Link2, "tab-links"],
	["tags", "Tags", Tags],
	["history", "History", History],
	["changes", "Changes", GitCompareArrows],
	["planner", "Planner", PencilLine, "planner"],
];

const TAB_KEY = "vaultops:note-tools-tab";
function loadTab() {
	try {
		const saved = localStorage.getItem(TAB_KEY);
		return saved === "changes" ||
			saved === "history" ||
			saved === "outline" ||
			saved === "highlights" ||
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
	highlights = [],
	linkedFrom = [],
	noteId,
	noteTitle,
	onOpenNote = () => {},
	onRenameTag,
	historyHost,
	notePath,
	onApplyVersion,
	...properties
}: ComponentProps<typeof PropertiesPanel> & {
	/** For the History tab. */
	historyHost?: Pick<Host, "vcs" | "readText">;
	/** The open note's vault path, for the History tab. */
	notePath?: string;
	/** Write a note version built from history (see NoteHistoryPanel). */
	onApplyVersion?: (
		path: string,
		build: (current: Note | null) => Note,
		label: string,
	) => Promise<string | null>;
	hasNote: boolean;
	/** Vault notes, used to list tags and counts in the Tags tool. */
	notes?: NoteRow[];
	/** Tag currently filtering the left sidebar tree, if any. */
	activeTag?: string | null;
	highlights?: HighlightItem[];
	outline?: OutlineItem[];
	/** Notes and canvases that link to the open note. */
	linkedFrom?: NoteRow[];
	noteId?: string;
	noteTitle?: string;
	onOpenNote?: (path: string) => void;
	/** Rename or merge a tag across the vault; resolves with a message to show. */
	onRenameTag?: (from: string, to: string) => Promise<string | null>;
}) {
	const features = useFeatures();
	const shown = TOOLS.filter(
		([, , , feature]) => !feature || features.isEnabled(feature),
	);
	// A remembered tab that is switched off falls back to the first one shown.
	const [chosen, setTab] = useState(loadTab);
	const tab = shown.some(([id]) => id === chosen)
		? chosen
		: (shown[0]?.[0] ?? chosen);
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
					{shown.find(([id]) => id === tab)?.[1] ?? "Details"}
				</strong>
				<TabsList aria-label="Note details" className="sidebar-tabs">
					{shown.map(([id, label, Icon]) => (
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
			<TabsContent value="highlights">
				{hasNote ? (
					<HighlightsPanel items={highlights} />
				) : (
					<p>Open a note to see its highlights.</p>
				)}
			</TabsContent>
			<TabsContent value="links">
				{hasNote ? (
					<LinkedFromPanel
						rows={linkedFrom}
						notes={notes}
						noteId={noteId}
						title={noteTitle}
						onOpen={onOpenNote}
					/>
				) : (
					<p>Open a note to see its connections.</p>
				)}
			</TabsContent>
			<TabsContent value="tags">
				<TagIndex
					rows={notes}
					active={activeTag}
					onPick={properties.onOpenTag}
					onRename={onRenameTag}
				/>
				{notes.every((note) => note.tags.length === 0) && <p>No tags yet.</p>}
			</TabsContent>
			<TabsContent value="planner">
				<PlannerPanel />
			</TabsContent>
			<TabsContent value="history">
				{historyHost && notePath && hasNote ? (
					<NoteHistoryPanel
						host={historyHost}
						path={notePath}
						onApply={
							onApplyVersion
								? (build, label) => onApplyVersion(notePath, build, label)
								: undefined
						}
					/>
				) : (
					<p className="settings-note">Open a note to see its history.</p>
				)}
			</TabsContent>
			<TabsContent value="changes">
				<p>Commit, history and sync arrive soon.</p>
				<p>No changes to show yet.</p>
			</TabsContent>
		</Tabs>
	);
}
