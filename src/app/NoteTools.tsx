import { type ComponentProps, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertiesPanel } from "./PropertiesPanel";

const TAB_KEY = "vaultops:note-tools-tab";
function loadTab() {
	try {
		return localStorage.getItem(TAB_KEY) === "changes"
			? "changes"
			: "properties";
	} catch {
		return "properties";
	}
}

export function NoteTools({
	hasNote,
	...properties
}: ComponentProps<typeof PropertiesPanel> & { hasNote: boolean }) {
	const [tab, setTab] = useState(loadTab);
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
				<TabsTrigger value="changes">Changes</TabsTrigger>
			</TabsList>
			<TabsContent value="properties">
				{hasNote ? (
					<PropertiesPanel {...properties} />
				) : (
					<p>Open a note to see its properties.</p>
				)}
			</TabsContent>
			<TabsContent value="changes">
				<p>Commit, history and sync arrive soon.</p>
				<p>No changes to show yet.</p>
			</TabsContent>
		</Tabs>
	);
}
