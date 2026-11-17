export function TypeRow({
	label,
	count,
	active,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="res-row"
			aria-current={active ? "true" : undefined}
			onClick={onClick}
		>
			<span>{label}</span>
			<span className="res-hint">{count}</span>
		</button>
	);
}
