export function Choice({
	checked,
	label,
	detail,
	onPick,
}: {
	checked: boolean;
	label: string;
	detail: string;
	onPick: () => void;
}) {
	return (
		<label className="res-choice" data-checked={checked}>
			<input
				type="radio"
				name="res-choice"
				checked={checked}
				onChange={onPick}
			/>
			<span>
				<strong>{label}</strong>
				<span className="res-hint">{detail}</span>
			</span>
		</label>
	);
}
