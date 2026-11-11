import { Component, type ErrorInfo, type ReactNode } from "react";
import type { Logger } from "./logger";

/** Shows a plain message instead of a blank window, and records what broke. */
export class ErrorBoundary extends Component<
	{ logger: Logger; children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		this.props.logger.log({
			kind: "error",
			name: "render",
			ok: false,
			detail: {
				message: error.message.slice(0, 600),
				stack: (error.stack ?? "").slice(0, 600),
				component: (info.componentStack ?? "").slice(0, 600),
			},
		});
		this.props.logger.count("errors");
		void this.props.logger.flush();
	}

	render() {
		if (!this.state.failed) return this.props.children;
		return (
			<main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
				<h1>Something broke</h1>
				<p>
					Your notes on disk are untouched. The details were written to the
					debug log. Reload the window to continue.
				</p>
				<button type="button" onClick={() => location.reload()}>
					Reload
				</button>
			</main>
		);
	}
}
