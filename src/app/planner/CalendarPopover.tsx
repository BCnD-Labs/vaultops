import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { Agenda } from "./CalendarView";
import { MiniCalendar } from "./MiniCalendar";
import { usePlanner } from "./PlannerContext";

/**
 * The calendar button at the right of the title bar. It stays in place on every
 * screen and opens a month with the chosen day's items. It shows only when
 * Settings puts the calendar in the title bar; the sidebar shows it otherwise.
 * It fades in when the pointer comes near and out a second after it leaves
 * (CSS: `.calendar-reveal`), and stays while open or focused.
 */
export function CalendarPopover() {
	const p = usePlanner();
	if (!p.calendarInTitleBar) return null;
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="nav-step calendar-reveal"
							aria-label="Calendar"
						>
							<CalendarDays aria-hidden="true" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Calendar</TooltipContent>
			</Tooltip>
			<PopoverContent align="end" className="calendar-popover">
				<MiniCalendar
					date={p.date}
					today={p.today}
					tasks={p.tasks}
					loggedDays={p.loggedDays}
					onDate={p.setDate}
				/>
				<Agenda
					date={p.date}
					tasks={p.tasks}
					selected={p.selectedPath}
					writable={false}
					onSelect={p.select}
					onAdd={() => {}}
				/>
				<div className="calendar-popover-foot">
					<Button variant="ghost" size="sm" onClick={p.openScreen}>
						Open planner
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
