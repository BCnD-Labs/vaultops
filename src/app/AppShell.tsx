import { PanelLeft, PanelRight } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TextStats } from "../core/notes/text-stats";
import type { ResourceCard, ResourceType } from "../core/resources/resources";
import { buildCommit } from "./build-info";
import { CommandBar } from "./CommandBar";
import { NavBar } from "./NavBar";
import {
	CalendarGroup,
	DockZone,
	ToolDragProvider,
} from "./planner/CalendarDock";
import { StatusBar } from "./StatusBar";
import type { NoteRow } from "./session";
import { loadLayout, saveLayout, sidebarShortcut } from "./shell-layout";
import { commandBinding, isMacPlatform } from "./shortcuts";

export const ShellNavigation = createContext({
	tags: 0,
	changes: 0,
	planner: 0,
	newFolder: 0,
	toolsVisible: true,
	/** Whether each sidebar is collapsed, so the window's top row can leave room for its toggle. */
	leftCollapsed: false,
	rightCollapsed: false,
	propertyRequest: null as { name?: string } | null,
	openProperties: (_name?: string) => {},
	openSearch: () => {},
});

export function AppShell({
	sidebar,
	tools,
	children,
	vault,
	path,
	title,
	notes = [],
	writable = false,
	selectedFolder = "",
	onOpenNote = () => {},
	onCreateNote = () => {},
	onNavigateScreen = () => {},
	canGoBack = false,
	canGoForward = false,
	stats = null,
	onBack = () => {},
	onForward = () => {},
	onToggleReading,
	onMoveNote,
	onOpenTemplates,
	onOpenResources,
	resources,
	resourceTypes,
	onOpenResource,
	titleInPanes = false,
}: {
	sidebar: ReactNode;
	tools?: ReactNode;
	children: ReactNode;
	vault: string;
	path: string | null;
	title: string | null;
	notes?: NoteRow[];
	writable?: boolean;
	selectedFolder?: string;
	onOpenNote?: (path: string) => void;
	onCreateNote?: (folder: string, title: string) => void;
	onNavigateScreen?: (
		screen: "note" | "trash" | "health" | "settings" | "planner",
	) => void;
	canGoBack?: boolean;
	canGoForward?: boolean;
	stats?: TextStats | null;
	onBack?: () => void;
	onForward?: () => void;
	reading?: boolean;
	onToggleReading?: () => void;
	onMoveNote?: () => void;
	/** Opens the template manager (the command bar offers it when this is set). */
	onOpenTemplates?: () => void;
	/** Opens the resource manager (the command bar offers it when this is set). */
	onOpenResources?: () => void;
	/** Resource cards and their types, so the search bar can find them. */
	resources?: ResourceCard[];
	resourceTypes?: ResourceType[];
	onOpenResource?: (noteId: string) => void;
	/** The panes draw their own title bars under their tab strips, so the
	 *  window-wide one is left out. */
	titleInPanes?: boolean;
}) {
	const [propertyRequest, setPropertyRequest] = useState<{
		name?: string;
	} | null>(null);
	const [navigation, setNavigation] = useState({
		tags: 0,
		changes: 0,
		planner: 0,
		newFolder: 0,
	});
	const [searchRequest, setSearchRequest] = useState(0);
	const left = useRef<PanelImperativeHandle>(null);
	const right = useRef<PanelImperativeHandle>(null);
	const [defaultLayout] = useState(loadLayout);
	const [collapsed, setCollapsed] = useState({
		left: defaultLayout?.left === 0,
		right: defaultLayout?.right === 0,
	});
	const toggle = useCallback((side: "left" | "right") => {
		const panel = (side === "left" ? left : right).current;
		if (panel?.isCollapsed()) panel.expand();
		else panel?.collapse();
	}, []);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const side = sidebarShortcut(
				event,
				commandBinding("toggle-left"),
				commandBinding("toggle-right"),
				isMacPlatform(),
			);
			if (!side) return;
			event.preventDefault();
			toggle(side);
		};
		// Capture runs before editor keymaps, even with the caret in the document.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [toggle]);

	const sidebarToggle = (side: "left" | "right") => {
		const Icon = side === "left" ? PanelLeft : PanelRight;
		const label = `Toggle ${side} sidebar`;
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className={`shell-toggle shell-toggle-${side}`}
						aria-label={label}
						aria-controls={side}
						aria-expanded={!collapsed[side]}
						onClick={() => toggle(side)}
					>
						<Icon aria-hidden="true" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					{label} [{side === "left" ? "⌘\\" : "⌘⇧\\"}]
				</TooltipContent>
			</Tooltip>
		);
	};
	return (
		<ToolDragProvider>
			<ShellNavigation.Provider
				value={{
					...navigation,
					toolsVisible: !collapsed.right,
					leftCollapsed: collapsed.left,
					rightCollapsed: collapsed.right,
					propertyRequest,
					openProperties: (name) => {
						right.current?.expand();
						setPropertyRequest({ name });
					},
					openSearch: () => setSearchRequest((count) => count + 1),
				}}
			>
				<div className="app-shell">
					{/* One toggle for both states, so it never moves or remounts when the
				    sidebar opens or closes; the sidebar header and the nav bar each
				    leave room for it. */}
					<div className="shell-toggle-anchor">{sidebarToggle("left")}</div>
					<div className="shell-toggle-anchor shell-toggle-anchor-right">
						{sidebarToggle("right")}
					</div>
					<ResizablePanelGroup
						orientation="horizontal"
						className="shell-regions"
						defaultLayout={defaultLayout}
						onLayoutChanged={(layout, meta) => {
							saveLayout(meta.requestedLayout ?? layout);
							// Follow the panels themselves: if two sidebars change in one
							// breath their resize callbacks can leave this state behind, and
							// a collapsed sidebar's show button then goes missing.
							const next = {
								left: left.current?.isCollapsed() ?? false,
								right: right.current?.isCollapsed() ?? false,
							};
							setCollapsed((s) =>
								s.left === next.left && s.right === next.right ? s : next,
							);
						}}
					>
						<ResizablePanel
							id="left"
							panelRef={left}
							defaultSize={300}
							minSize={220}
							maxSize={520}
							collapsible
							collapsedSize={0}
							onResize={(size) =>
								setCollapsed((s) => ({ ...s, left: size.asPercentage === 0 }))
							}
						>
							<div className="shell-side" inert={collapsed.left}>
								{sidebar}
							</div>
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel id="editor" minSize={420} className="shell-editor">
							<div className="editor-column">
								{!titleInPanes && (
									<NavBar
										vault={vault}
										path={path}
										title={title}
										canGoBack={canGoBack}
										canGoForward={canGoForward}
										onBack={onBack}
										onForward={onForward}
										clearLeftToggle={collapsed.left}
										clearRightToggle={collapsed.right}
									/>
								)}
								<div className="editor-column-body">{children}</div>
								<StatusBar vault={vault} stats={stats} build={buildCommit} />
							</div>
							<CommandBar
								notes={notes}
								writable={writable}
								selectedFolder={selectedFolder}
								openRequest={searchRequest}
								onOpenNote={onOpenNote}
								onCreateNote={onCreateNote}
								onNewFolder={() => {
									left.current?.expand();
									setNavigation((state) => ({
										...state,
										newFolder: state.newFolder + 1,
									}));
								}}
								onToggle={toggle}
								onToggleReading={onToggleReading}
								onMoveNote={onMoveNote}
								onOpenTemplates={onOpenTemplates}
								onOpenResources={onOpenResources}
								resources={resources}
								resourceTypes={resourceTypes}
								onOpenResource={onOpenResource}
								onNavigate={onNavigateScreen}
							/>
						</ResizablePanel>
						<ResizableHandle />
						<ResizablePanel
							id="right"
							panelRef={right}
							defaultSize={300}
							minSize={240}
							maxSize={480}
							collapsible
							collapsedSize={0}
							className="shell-right"
							onResize={(size) =>
								setCollapsed((s) => ({ ...s, right: size.asPercentage === 0 }))
							}
						>
							<aside aria-label="Note details" inert={collapsed.right}>
								<div className="shell-right-main">{tools}</div>
								<CalendarGroup side="right" />
								<DockZone side="right" />
							</aside>
						</ResizablePanel>
					</ResizablePanelGroup>
				</div>
			</ShellNavigation.Provider>
		</ToolDragProvider>
	);
}
