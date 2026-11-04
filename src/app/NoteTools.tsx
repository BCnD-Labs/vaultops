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
import { OutlinePanel } from "./OutlinePanel";
import { PropertiesPanel } from "./PropertiesPanel";

const TAB_KEY = "vaultops:note-tools-tab";
function loadTab() {
	try {
		const saved = localStorage.getItem(TAB_KEY);
		return saved === "changes" || saved === "outline" ? saved : "properties";
	} catch {
		return "properties";
	}
}

export function NoteTools({
	hasNote,
	outline = [],
	...properties
}: ComponentProps<typeof PropertiesPanel> & {
	hasNote: boolean;
	outline?: OutlineItem[];
}) {
	const [tab, setTab] = useState(loadTab);
	const panel = useRef<HTMLElement>(null);
	const { changes, propertyRequest, toolsVisible } =
		useContext(ShellNavigation);
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
			<TabsList aria-label="Note details">
				<TabsTrigger value="properties">Properties</TabsTrigger>
				<TabsTrigger value="outline">Outline</TabsTrigger>
				<TabsTrigger value="changes">Changes</TabsTrigger>
			</TabsList>
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
			<TabsContent value="changes">
				<p>Commit, history and sync arrive soon.</p>
				<p>No changes to show yet.</p>
			</TabsContent>
		</Tabs>
	);
}
