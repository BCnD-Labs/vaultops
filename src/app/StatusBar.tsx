import type { ReactNode } from "react";
import type { TextStats } from "../core/notes/text-stats";

const number = new Intl.NumberFormat();

/** The strip at the bottom of the editor column: the vault, and the open note's counts. */
export function StatusBar({
	vault,
	stats,
	build = null,
	extra,
}: {
	vault: string;
	stats: TextStats | null;
	/** The short commit this app was built from; nothing is shown without it. */
	build?: string | null;
	/** Controls shown at the end of the bar. */
	extra?: ReactNode;
}) {
	return (
		<div className="status-bar">
			<span className="status-bar-vault">
				{vault}
				{build && (
					<span
						className="status-bar-build"
						title="The commit this app was built from"
					>
						build {build}
					</span>
				)}
			</span>
			{stats && (
				<span className="status-bar-counts">
					<span>
						{number.format(stats.words)} {stats.words === 1 ? "word" : "words"}
					</span>
					<span>
						{number.format(stats.characters)}{" "}
						{stats.characters === 1 ? "character" : "characters"}
					</span>
				</span>
			)}
			{extra && <span className="status-bar-extra">{extra}</span>}
		</div>
	);
}
