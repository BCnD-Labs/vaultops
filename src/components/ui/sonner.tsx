import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

// Toast host. Mount <Toaster /> once near the root, then call `toast("...")`
// from "sonner" anywhere. Colors come from the theme tokens.
function Toaster(props: ComponentProps<typeof Sonner>) {
	return (
		<Sonner
			theme="system"
			// Bottom left, above the status bar: over the sidebar, clear of the editor.
			position="bottom-left"
			offset={{ bottom: 40, left: 16 }}
			className="toaster group"
			toastOptions={{
				classNames: {
					toast: "!rounded-md !shadow-md !text-sm",
					actionButton: "!bg-primary !text-primary-foreground",
				},
			}}
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
