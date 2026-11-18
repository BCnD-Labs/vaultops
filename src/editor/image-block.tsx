import { type Editor, mergeAttributes, Node } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { ImageOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
	attachmentName,
	imageWidth,
	snapWidth,
} from "../core/images/attachments";
import { displayBox, type Size } from "../core/images/display-copy";
import { insertBlocksAtCaret } from "./insert-blocks";
import { useEditable } from "./math-block";

/** What image blocks need from the app; the editor itself does no file access. */
export interface ImageSource {
	/** The bytes to show for an image under attachments/ filling `box` (device pixels). */
	show(path: string, box: Size): Promise<Blob>;
	/** Pick an image and copy it into attachments/; null when cancelled. */
	choose(): Promise<string | null>;
	/** Copy pasted or dropped bytes into attachments/ as `name`; resolves to the vault path. */
	store(name: string, bytes: ArrayBuffer): Promise<string>;
}

interface ImageOptions {
	source: () => ImageSource | null;
}

const imageOptions = (editor: Editor): ImageOptions | undefined =>
	editor.extensionManager.extensions.find((e) => e.name === "image")?.options;

const imageNode = (src: string) => ({ type: "image", attrs: { src } });

/** Ask the app for an image and put a block for it at the caret. */
export async function chooseImage(editor: Editor): Promise<void> {
	const source = imageOptions(editor)?.source();
	const path = await source?.choose().catch(() => null);
	if (path && !editor.isDestroyed)
		insertBlocksAtCaret(editor, [imageNode(path)]);
}

/**
 * Copy each image file into attachments/ and put a block for it at the caret.
 * A file the host refuses (over 25 MB, say) is left out.
 */
export async function importImages(
	editor: Editor,
	source: ImageSource,
	files: File[],
): Promise<void> {
	const nodes = [];
	for (const file of files) {
		const name = attachmentName(file.name, file.type);
		if (!name) continue;
		try {
			nodes.push(imageNode(await source.store(name, await file.arrayBuffer())));
		} catch {
			// Refused or unreadable: nothing was written for it.
		}
	}
	if (!editor.isDestroyed) insertBlocksAtCaret(editor, nodes);
}

/** An object URL for the display copy: undefined while it loads, null when it can't be shown. */
function useDisplayUrl(
	source: ImageSource | null,
	src: string,
	box: Size | null,
): string | null | undefined {
	const [url, setUrl] = useState<string | null>();
	useEffect(() => {
		if (!source || !src) return setUrl(null);
		if (!box) return;
		let active = true;
		let made: string | undefined;
		source.show(src, box).then(
			(blob) => {
				if (!active) return;
				made = URL.createObjectURL(blob);
				setUrl(made);
			},
			() => active && setUrl(null),
		);
		return () => {
			active = false;
			if (made) URL.revokeObjectURL(made);
		};
	}, [source, src, box]);
	return url;
}

function FadeImage({
	url,
	alt,
	...rest
}: { url: string; alt: string } & {
	onClick?: () => void;
	onError?: () => void;
}) {
	const [loaded, setLoaded] = useState(false);
	return (
		<img
			src={url}
			alt={alt}
			draggable={false}
			data-loaded={loaded || undefined}
			onLoad={() => setLoaded(true)}
			{...rest}
		/>
	);
}

/** The image sized to the window, still a display copy. */
function ImageViewer(props: {
	source: ImageSource;
	src: string;
	alt: string;
	onClose: () => void;
}) {
	const [box] = useState(() =>
		displayBox({ width: window.innerWidth * 0.9, height: 1 }, devicePixelRatio),
	);
	const url = useDisplayUrl(props.source, props.src, box);
	return (
		<Dialog open onOpenChange={(open) => !open && props.onClose()}>
			<DialogContent className="image-viewer w-auto max-w-[92vw] p-2">
				<DialogTitle className="sr-only">{props.alt || props.src}</DialogTitle>
				{url && <FadeImage url={url} alt={props.alt} />}
			</DialogContent>
		</Dialog>
	);
}

function ImageBlockView(props: NodeViewProps) {
	const { node, editor, extension, updateAttributes, deleteNode } = props;
	const editable = useEditable(editor);
	const src = String(node.attrs.src ?? "");
	const alt = String(node.attrs.alt ?? "");
	const width = imageWidth(node.attrs.width);
	const source = (extension.options as ImageOptions).source();
	const column = useRef<HTMLElement>(null);
	const [columnWidth, setColumnWidth] = useState(0);
	const [box, setBox] = useState<Size | null>(null);
	const [dragged, setDragged] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const [viewing, setViewing] = useState(false);

	useLayoutEffect(() => {
		const element = column.current;
		if (!element) return;
		const measure = () => setColumnWidth(element.clientWidth);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// The widest the image has been shown; it only grows, so narrowing the
	// window or the image never asks for a new copy. A hidden image (width 0)
	// waits until it is shown.
	useEffect(() => {
		if (!columnWidth) return;
		const next = displayBox(
			{ width: columnWidth * width, height: 1 },
			window.devicePixelRatio,
		);
		setBox((prev) => (prev && prev.width >= next.width ? prev : next));
	}, [columnWidth, width]);

	const url = useDisplayUrl(source, src, box);

	const resize = (event: React.PointerEvent<HTMLElement>) => {
		const frame = event.currentTarget.parentElement;
		if (!frame || !columnWidth) return;
		// Also keeps the block's own drag from starting on the handle.
		event.preventDefault();
		const handle = event.currentTarget;
		handle.setPointerCapture(event.pointerId);
		const left = frame.getBoundingClientRect().left;
		const at = (e: PointerEvent) =>
			Math.min(1, Math.max(0.1, (e.clientX - left) / columnWidth));
		const move = (e: PointerEvent) => setDragged(at(e));
		const end = (e: PointerEvent) => {
			handle.removeEventListener("pointermove", move);
			handle.removeEventListener("pointerup", end);
			handle.removeEventListener("pointercancel", end);
			setDragged(null);
			const snapped = snapWidth(at(e));
			updateAttributes({ width: snapped === 1 ? null : snapped });
		};
		handle.addEventListener("pointermove", move);
		handle.addEventListener("pointerup", end);
		handle.addEventListener("pointercancel", end);
	};

	const missing = url === null || failed;
	return (
		<NodeViewWrapper
			as="figure"
			ref={column}
			className="image-block"
			contentEditable={false}
		>
			{missing ? (
				<div className="image-block-missing">
					<ImageOff size={16} aria-hidden />
					<span>{src || "No image"}</span>
					{editable && (
						<Button size="sm" variant="ghost" onClick={() => deleteNode()}>
							Remove
						</Button>
					)}
				</div>
			) : (
				<div
					className="image-block-frame"
					data-resizing={dragged !== null || undefined}
					style={{ width: `${(dragged ?? width) * 100}%` }}
				>
					{url && (
						<FadeImage
							url={url}
							alt={alt}
							onClick={() => setViewing(true)}
							onError={() => setFailed(true)}
						/>
					)}
					{editable && (
						<span
							className="image-block-handle"
							role="presentation"
							title="Drag to resize"
							onPointerDown={resize}
						/>
					)}
				</div>
			)}
			{editable ? (
				<input
					className="image-block-caption"
					value={alt}
					placeholder="Add a caption"
					aria-label="Image caption"
					onChange={(event) => updateAttributes({ alt: event.target.value })}
				/>
			) : (
				alt && <figcaption className="image-block-caption">{alt}</figcaption>
			)}
			{viewing && source && (
				<ImageViewer
					source={source}
					src={src}
					alt={alt}
					onClose={() => setViewing(false)}
				/>
			)}
		</NodeViewWrapper>
	);
}

/**
 * An image from the vault's attachments/ folder. One line in the note,
 * `{"type":"image","attrs":{"src":"attachments/cat.png","alt":"A cat","width":0.5}}`:
 * `alt` is the caption and `width` a fraction of the column (none means the
 * whole column). Only a display copy sized to the screen is ever decoded.
 */
export const ImageBlock = Node.create<ImageOptions>({
	name: "image",
	group: "block",
	atom: true,
	selectable: true,
	draggable: true,

	addOptions: () => ({ source: () => null }),

	addAttributes() {
		return {
			src: {
				default: "",
				parseHTML: (element) => element.getAttribute("data-src") ?? "",
				renderHTML: (attributes) => ({ "data-src": attributes.src }),
			},
			alt: {
				default: "",
				parseHTML: (element) => element.getAttribute("data-alt") ?? "",
				renderHTML: (attributes) => ({ "data-alt": attributes.alt }),
			},
			width: {
				default: null,
				parseHTML: (element) => {
					const width = imageWidth(Number(element.getAttribute("data-width")));
					return width === 1 ? null : width;
				},
				renderHTML: (attributes) =>
					attributes.width ? { "data-width": attributes.width } : {},
			},
		};
	},

	renderText: ({ node }) => String(node.attrs.alt || node.attrs.src),

	parseHTML() {
		return [{ tag: 'figure[data-type="image-block"]' }];
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"figure",
			mergeAttributes(HTMLAttributes, { "data-type": "image-block" }),
		];
	},

	addNodeView() {
		return ReactNodeViewRenderer(ImageBlockView, {
			// The caption and the resize handle take their own keys and pointer
			// (a drag of the block itself still goes to the editor).
			stopEvent: ({ event }) =>
				event.target instanceof Element &&
				event.target.closest("input, .image-block-handle") !== null &&
				!event.type.startsWith("drag"),
			ignoreMutation: () => true,
		});
	},

	addProseMirrorPlugins() {
		const { editor, options } = this;
		// Pasted or dropped image files become attachments and image blocks.
		const take = (event: Event, files?: FileList, at?: number) => {
			const images = [...(files ?? [])].filter((file) =>
				attachmentName(file.name, file.type),
			);
			const source = options.source();
			// Settings > Features can switch adding images off.
			const on = editor.storage.slashMenu?.featureOn?.("images") !== false;
			if (!images.length || !source || !on) return false;
			event.preventDefault();
			if (at !== undefined) editor.commands.setTextSelection(at);
			void importImages(editor, source, images);
			return true;
		};
		return [
			new Plugin({
				props: {
					handlePaste: (_view, event) =>
						take(event, event.clipboardData?.files),
					handleDrop: (view, event) =>
						take(
							event,
							event.dataTransfer?.files,
							view.posAtCoords({ left: event.clientX, top: event.clientY })
								?.pos,
						),
				},
			}),
		];
	},
});
