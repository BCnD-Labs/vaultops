import { Button } from "@/components/ui/button";
import type { ResourceType } from "../../core/resources/resources";
import { plural } from "./resource-utils";

/** "What are you adding?": one tile per type, plus a way to add a type. */
export function TypePicker({
	types,
	onPick,
	onAddType,
	onCancel,
}: {
	types: ResourceType[];
	onPick: (type: ResourceType) => void;
	onAddType: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="res-pick">
			<div>
				<h2>What are you adding?</h2>
				<p className="res-hint">
					Each type asks for as little as possible. You can add detail later.
				</p>
			</div>
			<div className="res-pick-grid">
				{types.map((t) => (
					<button
						key={t.id}
						type="button"
						className="res-pick-tile"
						onClick={() => onPick(t)}
					>
						<strong>{t.name}</strong>
						<span className="res-hint">
							Needs only a {t.titleLabel.toLowerCase()}
						</span>
						<span className="res-hint">
							{plural(t.fields.length, "optional field")}
						</span>
					</button>
				))}
				<button
					type="button"
					className="res-pick-tile res-pick-add"
					onClick={onAddType}
				>
					+ Add type
				</button>
			</div>
			<div>
				<Button size="sm" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
