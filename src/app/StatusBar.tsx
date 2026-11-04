import type { TextStats } from "../core/notes/text-stats";

const number = new Intl.NumberFormat();

/** The strip at the bottom of the editor column: the vault, and the open note's counts. */
export function StatusBar({
	vault,
	stats,
}: {
	vault: string;
	stats: TextStats | null;
}) {
	return (
		<div className="status-bar">
			<span className="status-bar-vault">{vault}</span>
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
		</div>
	);
}
