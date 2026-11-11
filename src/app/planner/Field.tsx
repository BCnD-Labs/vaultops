import { type ReactNode, useId } from "react";

/** A caption tied to its control by id. */
export function Field({
	label,
	children,
}: {
	label: string;
	children: (id: string) => ReactNode;
}) {
	const id = useId();
	return (
		<div className="plan-field">
			<label htmlFor={id}>{label}</label>
			{children(id)}
		</div>
	);
}
