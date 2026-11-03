import { Button } from "@/components/ui/button";
import type { HealthEntry } from "../core/notes/scan";

export const healthCount = (report: HealthEntry[]) =>
	report.filter(
		(e) =>
			e.group !== "good" ||
			e.duplicateOf.length > 0 ||
			(e.duplicateBlockOf?.length ?? 0) > 0,
	).length;
export const healthLabel = (report: HealthEntry[]) =>
	healthCount(report) ? `Health (${healthCount(report)})` : "Health";

const groups = [
	["corrupt", "Could not be read"],
	["truncated", "Partly unreadable (truncated)"],
	["newer-format", "Written by a newer version"],
	["duplicate", "Same note id as another file"],
	["duplicate-block", "Block exists in two places"],
] as const;

export function HealthScreen({
	report,
	onOpen,
}: {
	report: HealthEntry[];
	onOpen: (path: string) => void;
}) {
	return (
		<section className="vault-screen">
			<h2>Vault health</h2>
			{!healthCount(report) && <p>Every note loaded fine.</p>}
			{groups.map(([group, heading]) => {
				const rows = report.filter((e) =>
					group === "duplicate"
						? e.duplicateOf.length > 0
						: group === "duplicate-block"
							? (e.duplicateBlockOf?.length ?? 0) > 0
							: e.group === group,
				);
				return (
					rows.length > 0 && (
						<section key={group}>
							<h3>{heading}</h3>
							{rows.map((e) => (
								<div className="vault-row" key={e.path}>
									<Button variant="secondary" onClick={() => onOpen(e.path)}>
										{e.path}
									</Button>
									<p>{e.reason}</p>
									{e.duplicateOf.length > 0 && (
										<p>Other files: {e.duplicateOf.join(", ")}</p>
									)}
									{!!e.duplicateBlockOf?.length && (
										<p>
											Other files with this block:{" "}
											{e.duplicateBlockOf.join(", ")}
										</p>
									)}
								</div>
							))}
						</section>
					)
				);
			})}
		</section>
	);
}
