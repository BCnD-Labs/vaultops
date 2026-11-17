import { Input } from "@/components/ui/input";
import { linkProblem } from "../../core/resources/link";
import type { ResourceField } from "../../core/resources/resources";

export function FieldInput({
	id,
	field,
	value,
	onChange,
}: {
	id: string;
	field: ResourceField;
	value: string;
	onChange: (value: string) => void;
}) {
	const problem = field.kind === "link" ? linkProblem(value) : null;
	return (
		<>
			<label className="res-field" htmlFor={id}>
				<span>
					{field.label} <em>{field.required ? "Required" : "Optional"}</em>
				</span>
				{field.kind === "long" ? (
					<textarea
						id={id}
						value={value}
						onChange={(event) => onChange(event.target.value)}
					/>
				) : (
					<Input
						id={id}
						type={
							field.kind === "date"
								? "date"
								: field.kind === "number"
									? "number"
									: field.kind === "link"
										? "text"
										: "text"
						}
						value={value}
						inputMode={field.kind === "link" ? "url" : undefined}
						aria-invalid={problem !== null}
						aria-describedby={problem ? `${id}-error` : undefined}
						onChange={(event) => onChange(event.target.value)}
					/>
				)}
			</label>
			{problem && (
				<p id={`${id}-error`} role="alert" className="res-error">
					{problem}
				</p>
			)}
		</>
	);
}
