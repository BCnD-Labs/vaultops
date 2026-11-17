import { Button } from "@/components/ui/button";
import {
	completeness,
	type ResourceCard,
	type ResourceType,
} from "../../core/resources/resources";
import { labelOf, plural, subtitle } from "./resource-utils";

/** The middle column: the cards that match the filter and the search. */
export function CardList({
	rows,
	types,
	query,
	filter,
	filterType,
	loaded,
	selected,
	onPick,
	onEditType,
}: {
	rows: ResourceCard[];
	types: ResourceType[];
	query: string;
	filter: string;
	filterType: ResourceType | null;
	loaded: boolean;
	selected: string | null;
	onPick: (path: string) => void;
	onEditType: () => void;
}) {
	return (
		<section aria-label="Cards" className="res-list">
			<div className="res-list-head">
				<h2>
					{query.trim() ? "Results" : (filterType?.name ?? labelOf(filter))}
				</h2>
				<span className="res-hint">{plural(rows.length, "card")}</span>
			</div>
			{filterType && (
				<div>
					<Button size="sm" variant="outline" onClick={onEditType}>
						Edit type and fields
					</Button>
				</div>
			)}
			<ul className="res-rows">
				{rows.map((c) => {
					const t = types.find((x) => x.id === c.typeId) ?? null;
					const meter = t ? completeness(c, t) : null;
					return (
						<li key={c.path}>
							<button
								type="button"
								className="res-row res-card-row"
								aria-current={selected === c.path ? "true" : undefined}
								onClick={() => onPick(c.path)}
							>
								<span className="res-tile" aria-hidden="true">
									{t ? t.name.charAt(0).toUpperCase() : "–"}
								</span>
								<span className="res-card-text">
									<strong>{c.title}</strong>
									<span className="res-hint">{subtitle(c, t)}</span>
								</span>
								<span className="res-hint res-meter">
									{meter ? `${meter.filled} of ${meter.total}` : "No type"}
								</span>
							</button>
						</li>
					);
				})}
			</ul>
			{loaded && rows.length === 0 && (
				<p className="manager-empty">
					{query.trim()
						? `No cards match "${query.trim()}". Try fewer words, or search All.`
						: "No cards here yet."}
				</p>
			)}
		</section>
	);
}
