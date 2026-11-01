import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

// Toast host. Mount <Toaster /> once near the root, then call `toast("...")`
// from "sonner" anywhere. Colors come from the theme tokens.
function Toaster(props: ComponentProps<typeof Sonner>) {
	return (
		<Sonner
			theme="system"
			className="toaster group"
			style={
				{
					"--normal-bg": "var(--background)",
					"--normal-text": "var(--foreground)",
					"--normal-border": "var(--border)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}

export { Toaster };
