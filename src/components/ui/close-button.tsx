import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "./button";

type CloseButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
	/** The accessible name; also the tooltip text. */
	label?: string;
};

/** The X that closes a dialog or window: a quiet icon button. */
function CloseButton({
	size = "icon-sm",
	label = "Close",
	...props
}: CloseButtonProps) {
	return (
		<Button
			type="button"
			variant="ghost"
			size={size}
			aria-label={label}
			{...props}
		>
			<X aria-hidden="true" />
		</Button>
	);
}

export { CloseButton };
