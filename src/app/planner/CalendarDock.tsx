import { CalendarDays, Ellipsis } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { CalendarPanel } from "./CalendarPanel";
import { type CalendarDock, usePlanner } from "./PlannerContext";

/** The drag payload type that carries the calendar from one place to another. */
export const TOOL_DRAG_TYPE = "application/x-vaultops-tool";

/** Whether the calendar is being carried, so drop zones can show up. */
const ToolDragContext = createContext({
	carrying: false,
	begin: () => {},
	end: () => {},
});

export function ToolDragProvider({ children }: { children: ReactNode }) {
	const [carrying, setCarrying] = useState(false);
	const timer = useRef<number | undefined>(undefined);
	const begin = useCallback(() => {
		// One tick later: changing the page inside dragstart can end the drag in
		// WebKit before it starts.
		timer.current = window.setTimeout(() => setCarrying(true), 0);
	}, []);
	const end = useCallback(() => {
		window.clearTimeout(timer.current);
		setCarrying(false);
	}, []);
	useEffect(() => () => window.clearTimeout(timer.current), []);
	const value = useMemo(
		() => ({ carrying, begin, end }),
		[carrying, begin, end],
	);
	return (
		<ToolDragContext.Provider value={value}>
			{children}
		</ToolDragContext.Provider>
	);
}
export const useToolDrag = () => useContext(ToolDragContext);

/** Props that make an element carry the calendar when dragged. */
export function useCalendarDragSource() {
	const { begin, end } = useToolDrag();
	return {
		draggable: true as const,
		onDragStart: (event: React.DragEvent) => {
			event.dataTransfer.setData(TOOL_DRAG_TYPE, "calendar");
			event.dataTransfer.effectAllowed = "move";
			begin();
		},
		onDragEnd: end,
	};
}

const places: [CalendarDock, string][] = [
	["planner", "In the planner"],
	["right", "Right sidebar, below the tools"],
	["left", "Left sidebar, below the files"],
];

/** The pointer-free way to move the calendar (the drag does the same). */
export function CalendarMoveMenu() {
	const p = usePlanner();
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="dock-more"
							aria-label="Move the calendar"
						>
							<Ellipsis aria-hidden="true" />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Move the calendar</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup
					value={p.calendarDock}
					onValueChange={(value) => {
						const place = places.find(([id]) => id === value);
						if (place) p.setCalendarDock(place[0]);
					}}
				>
					{places.map(([id, label]) => (
						<DropdownMenuRadioItem key={id} value={id}>
							{label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * The calendar on its own below a sidebar's tools, with a one-tab strip like an
 * Obsidian tab group. Drag the tab to the other sidebar, or back onto the
 * planner. It reads the same planner state as everywhere else.
 */
export function CalendarGroup({ side }: { side: "left" | "right" }) {
	const p = usePlanner();
	const source = useCalendarDragSource();
	if (p.calendarInTitleBar || p.calendarDock !== side) return null;
	return (
		<section className="dock-group" aria-label="Calendar group">
			<div className="dock-tabs" role="tablist" aria-label="Calendar tabs">
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							role="tab"
							aria-selected="true"
							aria-label="Calendar"
							className="dock-tab"
							{...source}
						>
							<CalendarDays aria-hidden="true" />
						</button>
					</TooltipTrigger>
					<TooltipContent>Calendar: drag to move</TooltipContent>
				</Tooltip>
				<CalendarMoveMenu />
			</div>
			<CalendarPanel />
		</section>
	);
}

/** Shown over the bottom of a sidebar while the calendar is carried. */
export function DockZone({ side }: { side: "left" | "right" }) {
	const p = usePlanner();
	const { carrying, end } = useToolDrag();
	const [over, setOver] = useState(false);
	if (!carrying || p.calendarInTitleBar || p.calendarDock === side) return null;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a pointer-only drop target; the keyboard route is the Move the calendar menu
		<div
			role="presentation"
			className="dock-zone"
			data-over={over || undefined}
			data-testid={`dock-zone-${side}`}
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes(TOOL_DRAG_TYPE)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setOver(false);
				p.setCalendarDock(side);
				end();
			}}
		>
			<span>Dock the calendar here</span>
		</div>
	);
}

/** A strip at the top of the planner for putting the calendar back in it. */
export function PlannerHomeZone() {
	const p = usePlanner();
	const { carrying, end } = useToolDrag();
	const [over, setOver] = useState(false);
	if (!carrying || p.calendarInTitleBar || p.calendarDock === "planner")
		return null;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: a pointer-only drop target; the keyboard route is the Move the calendar menu
		<div
			role="presentation"
			className="dock-zone dock-zone-inline"
			data-over={over || undefined}
			data-testid="dock-zone-planner"
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes(TOOL_DRAG_TYPE)) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(event) => {
				event.preventDefault();
				setOver(false);
				p.setCalendarDock("planner");
				end();
			}}
		>
			<span>Put the calendar back in the planner</span>
		</div>
	);
}
