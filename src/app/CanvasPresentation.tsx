import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ComponentProps, useState } from "react";
import { Button } from "@/components/ui/button";
import { Canvas, type CanvasPresentationView } from "@/components/ui/canvas";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function CanvasPresentation({
	slides,
	from,
	opener,
	onClose,
	nodes,
	edges,
}: {
	slides: CanvasPresentationView["bounds"][];
	from?: CanvasPresentationView["from"];
	opener: HTMLElement;
	onClose: () => void;
	nodes: ComponentProps<typeof Canvas>["nodes"];
	edges: ComponentProps<typeof Canvas>["edges"];
}) {
	const [index, setIndex] = useState(0);
	const bounds = slides[index];
	const move = (by: number) =>
		setIndex((current) =>
			Math.max(0, Math.min(slides.length - 1, current + by)),
		);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="canvas-pane canvas-presentation"
				aria-describedby={undefined}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					opener.focus();
				}}
				onKeyDown={(event) => {
					event.stopPropagation();
					if (!bounds || event.metaKey || event.ctrlKey || event.altKey) return;
					const { key, shiftKey } = event;
					const back =
						key === "ArrowLeft" ||
						key === "ArrowUp" ||
						(key === " " && shiftKey);
					if (
						!back &&
						key !== "ArrowRight" &&
						key !== "ArrowDown" &&
						key !== " "
					)
						return;
					event.preventDefault();
					move(back ? -1 : 1);
				}}
			>
				<DialogTitle className="sr-only">Canvas presentation</DialogTitle>
				{bounds ? (
					<>
						<div className="canvas-surface" inert>
							<Canvas
								nodes={nodes}
								edges={edges}
								locked
								presentation={{ bounds, from }}
							/>
						</div>
						<button
							type="button"
							className="absolute inset-0 cursor-pointer"
							tabIndex={-1}
							aria-label="Advance presentation"
							onClick={() => move(1)}
						/>
						<div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md bg-background text-sm text-muted-foreground tabular-nums">
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Previous frame"
								disabled={index === 0}
								onClick={() => move(-1)}
							>
								<ChevronLeft aria-hidden="true" />
							</Button>
							<span aria-live="polite">
								{index + 1} / {slides.length}
							</span>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Next frame"
								disabled={index === slides.length - 1}
								onClick={() => move(1)}
							>
								<ChevronRight aria-hidden="true" />
							</Button>
						</div>
					</>
				) : (
					<p className="canvas-empty">There are no frames to present yet.</p>
				)}
			</DialogContent>
		</Dialog>
	);
}
