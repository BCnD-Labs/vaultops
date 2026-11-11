import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type Block, parseNote } from "../core/note-format";
import type { EmbedTarget } from "../core/notes/canvas-embed";
import type { Host } from "../host/host";
import { NoteBlocks } from "./CanvasCard";
import type { NoteRow } from "./session";

type Shown =
	| { state: "loading" }
	| { state: "ready"; blocks: Block[] }
	| { state: "unreadable" };

const WHY: { [status: string]: string } = {
	missing:
		"This note is not in the vault. The embed keeps its link, so it shows again if the note comes back.",
	ambiguous:
		"More than one file has this note's id, so none is shown. Vault health lists them.",
	canvas: "A canvas cannot be shown inside a canvas.",
	unlinked: "This embed does not point at a note.",
};

/**
 * A note shown read-only on a canvas, found by its id so a rename does not
 * break it. It only ever reads the note: nothing here writes to it. The text is
 * read again when the note's title or preview changes in the list.
 */
export function CanvasEmbed({
	host,
	target,
	locked = false,
	onOpen,
}: {
	host: Host;
	target: EmbedTarget<NoteRow>;
	locked?: boolean;
	onOpen?: (path: string) => void;
}) {
	const row = target.status === "found" ? target.row : null;
	const path = row?.path ?? null;
	const stamp = row ? `${row.title}\n${row.preview}` : "";
	const [shown, setShown] = useState<Shown>({ state: "loading" });
	// biome-ignore lint/correctness/useExhaustiveDependencies: `stamp` is how a changed note is noticed.
	useEffect(() => {
		if (path === null) return;
		let active = true;
		host
			.readText(path)
			.then((text) => {
				if (!active) return;
				const parsed = parseNote(text);
				setShown(
					parsed.note && parsed.note.header.kind !== "canvas"
						? { state: "ready", blocks: parsed.note.blocks }
						: { state: "unreadable" },
				);
			})
			.catch(() => {
				if (active) setShown({ state: "unreadable" });
			});
		return () => {
			active = false;
		};
	}, [host, path, stamp]);
	const title = row?.title ?? "Embedded note";
	return (
		<article
			aria-label="Embedded note"
			className={`canvas-item canvas-embed${locked ? " canvas-item-pinned" : ""}`}
			data-state={row ? shown.state : target.status}
			title={
				locked
					? "Shapes, sticky notes, labels, groups, embedded notes and connectors stay on the canvas."
					: undefined
			}
		>
			<header className="canvas-embed-bar">
				<span className="canvas-embed-title">{title}</span>
				{row && onOpen && (
					<Button
						size="icon"
						variant="ghost"
						className="nodrag"
						aria-label={`Open ${title}`}
						title="Open the note"
						onClick={() => onOpen(row.path)}
					>
						<ExternalLink size={14} aria-hidden="true" />
					</Button>
				)}
			</header>
			<div className="canvas-embed-body nowheel">
				{!row ? (
					<p className="canvas-embed-note">{WHY[target.status]}</p>
				) : shown.state === "ready" ? (
					<NoteBlocks blocks={shown.blocks} />
				) : shown.state === "unreadable" ? (
					<p className="canvas-embed-note">This note could not be read.</p>
				) : null}
			</div>
		</article>
	);
}
