import { DailyLog } from "./DailyLog";
import { usePlanner } from "./PlannerContext";
import "./planner.css";

/**
 * The Journal tool in the right sidebar. For now it is the daily log taken out
 * of the planner and shown on its own; weekly, monthly and yearly journals and
 * reflections are planned (see the project's journal notes), not built yet.
 */
export function JournalPanel() {
	const p = usePlanner();
	return (
		<section className="planner-side" aria-label="Journal">
			<DailyLog
				date={p.date}
				today={p.today}
				writable={p.writable}
				load={p.loadDay}
				version={p.version}
				onDate={p.setDate}
				onAddEntry={p.addEntry}
				onAddSection={p.addSection}
				onOpen={(day) => p.openNote(`Journal/${day}.vnote`)}
			/>
		</section>
	);
}
