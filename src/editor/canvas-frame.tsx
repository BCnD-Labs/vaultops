import { Node } from "@tiptap/core";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { createContext, type ReactNode, useContext } from "react";

export const CanvasFrameView = createContext<
	((canvasId: string, groupId: string) => ReactNode) | null
>(null);

function FrameNode({ node }: NodeViewProps) {
	const render = useContext(CanvasFrameView);
	const { canvasId, groupId } = node.attrs;
	return (
		<NodeViewWrapper contentEditable={false}>
			{typeof canvasId === "string" && typeof groupId === "string"
				? (render?.(canvasId, groupId) ?? "Frame unavailable")
				: "Frame unavailable"}
		</NodeViewWrapper>
	);
}

export const CanvasFrame = Node.create({
	name: "canvasFrame",
	group: "block",
	atom: true,
	addAttributes: () => ({
		canvasId: { default: null },
		groupId: { default: null },
	}),
	parseHTML: () => [{ tag: 'div[data-type="canvas-frame"]' }],
	renderHTML: ({ HTMLAttributes }) => [
		"div",
		{ ...HTMLAttributes, "data-type": "canvas-frame" },
		"Canvas frame",
	],
	addNodeView: () =>
		ReactNodeViewRenderer(FrameNode, {
			stopEvent: ({ event }) =>
				event.target instanceof Element &&
				event.target.closest("input, textarea") !== null,
		}),
});
