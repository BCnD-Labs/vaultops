import { PanelLeft, PanelRight } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { loadLayout, saveLayout, sidebarShortcut } from "./shell-layout";

export function AppShell({
	sidebar,
	children,
	vault,
	path,
	title,
}: {
	sidebar: ReactNode;
	children: ReactNode;
	vault: string;
	path: string | null;
	title: string | null;
}) {
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
			const side = sidebarShortcut(event);
			if (!side) return;
			event.preventDefault();
			toggle(side);
		};
		// Capture runs before editor keymaps, even with the caret in the document.
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [toggle]);

	return (
		<div className="app-shell">
			<header className="shell-bar">
				{(["left", "right"] as const).map((side) => {
					const Icon = side === "left" ? PanelLeft : PanelRight;
					const label = `Toggle ${side} sidebar`;
					return (
						<Tooltip key={side}>
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
								{label} ({side === "left" ? "⌘\\" : "⌘⇧\\"})
							</TooltipContent>
						</Tooltip>
					);
				})}
				<Breadcrumb className="shell-breadcrumb">
					<BreadcrumbList>
						{title !== null && (
							<>
								<BreadcrumbItem>
									{path?.split("/").slice(0, -1).join("/") || vault}
								</BreadcrumbItem>
								<BreadcrumbSeparator />
							</>
						)}
						<BreadcrumbItem>
							<BreadcrumbPage>{title ?? vault}</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</header>
			<ResizablePanelGroup
				orientation="horizontal"
				className="shell-regions"
				defaultLayout={defaultLayout}
				onLayoutChanged={(layout, meta) =>
					saveLayout(meta.requestedLayout ?? layout)
				}
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
					<div className="h-full" inert={collapsed.left}>
						{sidebar}
					</div>
				</ResizablePanel>
				<ResizableHandle />
				<ResizablePanel id="editor" minSize={420} className="shell-editor">
					{children}
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
						<Tabs defaultValue="properties">
							<TabsList aria-label="Note details">
								<TabsTrigger value="properties">Properties</TabsTrigger>
								<TabsTrigger value="changes">Changes</TabsTrigger>
							</TabsList>
							<TabsContent value="properties">Nothing here yet</TabsContent>
							<TabsContent value="changes">Nothing here yet</TabsContent>
						</Tabs>
					</aside>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
