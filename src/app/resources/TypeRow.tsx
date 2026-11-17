import type { ButtonHTMLAttributes } from "react";

export function TypeRow({
	label,
	count,
	active,
	onClick,
	...rest
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
	return (
		<button
			type="button"
			className="res-row"
			aria-current={active ? "true" : undefined}
			onClick={onClick}
			{...rest}
		>
			<span>{label}</span>
			<span className="res-hint">{count}</span>
		</button>
	);
}
