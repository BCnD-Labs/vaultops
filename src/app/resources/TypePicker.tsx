import { Button } from "@/components/ui/button";
import type { ResourceType } from "../../core/resources/resources";
import { plural } from "./resource-utils";

// A tile is a tall button: the fixed button height gives way to its text.
const TILE =
	"h-auto flex-col items-start gap-0.5 whitespace-normal px-3 py-2 text-left";

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
					<Button
						key={t.id}
						type="button"
						variant="secondary"
						className={TILE}
						onClick={() => onPick(t)}
					>
						<strong>{t.name}</strong>
						<span className="res-hint">
							Needs only a {t.titleLabel.toLowerCase()}
						</span>
						<span className="res-hint">
							{plural(t.fields.length, "optional field")}
						</span>
					</Button>
				))}
				<Button
					type="button"
					variant="ghost"
					className={`${TILE} items-center font-semibold`}
					onClick={onAddType}
				>
					+ Add type
				</Button>
			</div>
			<div>
				<Button size="sm" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</div>
	);
}
