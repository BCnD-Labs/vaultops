import { useState } from "react";
import { Agenda } from "./CalendarView";
import { MiniCalendar } from "./MiniCalendar";
import { NewItemDialog } from "./NewItemDialog";
import { usePlanner } from "./PlannerContext";
import "./planner.css";

/** The calendar tool: a month and the chosen day's items. Wherever it sits, it
 *  reads and writes the same planner state. */
export function CalendarPanel({ bare = false }: { bare?: boolean }) {
	const p = usePlanner();
	const [dialog, setDialog] = useState<string | null>(null);
	return (
		<section
			className={bare ? "planner-side planner-side-bare" : "planner-side"}
			aria-label="Calendar"
		>
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
				writable={p.writable}
				onSelect={(t) => {
					p.select(t);
				}}
				onAdd={(d) => setDialog(d)}
			/>
			{dialog !== null && (
				<NewItemDialog
					key={dialog}
					open
					defaults={{ date: dialog }}
					onClose={() => setDialog(null)}
					onCreate={p.create}
				/>
			)}
		</section>
	);
}
