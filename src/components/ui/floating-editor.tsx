import * as Dialog from "@radix-ui/react-dialog";
import { Pin } from "lucide-react";
import {
	type ReactNode,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { fitWindow, type WindowRect } from "@/core/floating-window";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { CloseButton } from "./close-button";
import "./floating-editor.css";

const viewportSize = () => ({ width: innerWidth, height: innerHeight });
let front = 0;

function windowLayer() {
	const existing = document.getElementById("floating-windows");
	if (existing) return existing;
	const layer = document.createElement("div");
	layer.id = "floating-windows";
	layer.className = "pointer-events-none fixed inset-0 z-40";
	return document.body.appendChild(layer);
}

function remembered(key: string, fallback: WindowRect): WindowRect {
	try {
		const value = JSON.parse(localStorage.getItem(key) ?? "null");
		if (
			value &&
			Object.keys(fallback).every((field) => Number.isFinite(value[field]))
		)
			return value;
	} catch {
		// Window geometry is optional UI memory.
	}
	return fallback;
}

/** A movable, nonmodal window. The portal also keeps the exit animation alive. */
export function FloatingWindow({
	anchor,
	title,
	open,
	top,
	editing,
	initial,
	kind,
	resizable = true,
	focusRequest,
	onClose,
	onExited,
	children,
}: {
	anchor?: HTMLElement;
	top?: boolean;
	editing?: boolean;
	title: string;
	open: boolean;
	initial?: WindowRect;
	kind?: string;
	resizable?: boolean;
	focusRequest?: object;
	onClose: () => void;
	onExited?: (restoreFocus: boolean) => void;
	children: ReactNode;
}) {
	const panel = useRef<HTMLDivElement>(null);
	const bar = useRef<HTMLElement>(null);
	const drag = useRef<{
		x: number;
		y: number;
		rect: WindowRect;
		resize: boolean;
	} | null>(null);
	const restore = useRef(false);
	const hovered = useRef(!focusRequest);
	const [pinned, pin] = useState(false);
	const key = kind && `vaultops.window.${kind}`;
	const [position, setPosition] = useState(() => {
		const bounds = anchor?.getBoundingClientRect();
		const below = bounds ? bounds.bottom + 6 : 8;
		const fallback = initial ?? {
			left: bounds?.left ?? 8,
			top: bounds && below + 272 >= innerHeight ? bounds.top - 276 : below,
			width: 380,
			height: 270,
		};
		return key ? remembered(key, fallback) : fallback;
	});
	const [viewport, setViewport] = useState(viewportSize);
	const [layer, setLayer] = useState<HTMLElement>();
	const rect = fitWindow(position, viewport);
	const expire = useEffectEvent(onClose);
	const exited = useEffectEvent(() => onExited?.(restore.current));

	useEffect(() => {
		if (!open) return;
		setLayer(windowLayer());
		const resize = () => setViewport(viewportSize());
		resize();
		window.addEventListener("resize", resize);
		return () => window.removeEventListener("resize", resize);
	}, [open]);

	useEffect(() => {
		if (!open || !layer || !panel.current) return;
		panel.current.style.zIndex = String(++front);
		if (!anchor) bar.current?.focus();
		else if (focusRequest && !panel.current.contains(document.activeElement))
			bar.current?.querySelector("button")?.focus();
	}, [open, layer, anchor, focusRequest]);

	useEffect(() => {
		if (open || !anchor) return;
		let current = true;
		const animations = panel.current?.getAnimations?.() ?? [];
		void Promise.allSettled(
			animations.map((animation) => animation.finished),
		).then(() => {
			if (current) exited();
		});
		return () => {
			current = false;
		};
	}, [open, anchor]);

	useEffect(() => {
		if (!anchor) return;
		let timer: ReturnType<typeof setTimeout>;
		const check = () => {
			clearTimeout(timer);
			if (hovered.current || !top || !open || pinned || editing) return;
			timer = setTimeout(() => {
				if (!drag.current && !panel.current?.contains(document.activeElement))
					expire();
			}, 240);
		};
		const inside = (target: EventTarget | null) =>
			target instanceof Node &&
			(anchor.contains(target) || panel.current?.contains(target));
		const track = (event: PointerEvent) => {
			const leaving = event.type === "pointerout";
			if (leaving && !inside(event.target)) return;
			const next = Boolean(
				inside(leaving ? event.relatedTarget : event.target),
			);
			if (next === hovered.current) return;
			hovered.current = next;
			check();
		};
		const controller = new AbortController();
		const options = { signal: controller.signal };
		document.addEventListener("pointerover", track, options);
		document.addEventListener("pointerout", track, options);
		document.addEventListener("focusout", check, options);
		document.addEventListener("lostpointercapture", check, options);
		check();
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [anchor, editing, open, pinned, top]);

	function move(x: number, y: number, start = rect, resize = false) {
		const next = fitWindow(start, viewport, { x, y, resize });
		setPosition(next);
		if (!key) return;
		try {
			localStorage.setItem(key, JSON.stringify(next));
		} catch {
			// The window still moves if storage is unavailable.
		}
	}

	function startDrag(event: ReactPointerEvent<HTMLElement>, resize = false) {
		if (event.button !== 0 || (event.target as Element).closest("button"))
			return;
		event.preventDefault();
		bar.current?.focus();
		drag.current = { x: event.clientX, y: event.clientY, rect, resize };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function raise() {
		if (panel.current) panel.current.style.zIndex = String(++front);
	}

	function close() {
		restore.current = true;
		onClose();
	}

	if (!layer) return null;
	return (
		<Dialog.Root open={open} modal={false}>
			<Dialog.Portal container={layer}>
				<div
					ref={panel}
					role="dialog"
					aria-label={title}
					inert={!open}
					data-state={open ? "open" : "closed"}
					className={cn(
						"floating-window pointer-events-auto absolute flex flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg inert:pointer-events-none",
						anchor && "floating-editor",
					)}
					style={rect}
					onPointerDownCapture={raise}
					onFocusCapture={raise}
					onPointerMove={(event) => {
						const active = drag.current;
						if (active)
							move(
								event.clientX - active.x,
								event.clientY - active.y,
								active.rect,
								active.resize,
							);
					}}
					onLostPointerCapture={() => {
						drag.current = null;
					}}
					onKeyDown={(event) => {
						if (
							event.key !== "Escape" ||
							event.defaultPrevented ||
							event.nativeEvent.isComposing ||
							!event.currentTarget.contains(event.target as Node)
						)
							return;
						event.stopPropagation();
						close();
					}}
				>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: The title bar can be dragged or nudged with arrow keys. */}
					<header
						ref={bar}
						tabIndex={0}
						aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
						className="settings-titlebar cursor-grab touch-none px-10 select-none"
						onPointerDown={startDrag}
						onKeyDown={(event) => {
							if (event.target !== event.currentTarget) return;
							const x = { ArrowLeft: -8, ArrowRight: 8 }[event.key] ?? 0;
							const y = { ArrowUp: -8, ArrowDown: 8 }[event.key] ?? 0;
							if (x || y) {
								event.preventDefault();
								move(x, y);
							}
						}}
					>
						<h2 className="settings-window-title truncate">{title}</h2>
						{anchor && (
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label="Pin window"
								aria-pressed={pinned}
								onClick={() => pin(!pinned)}
							>
								<Pin aria-hidden="true" />
							</Button>
						)}
						<CloseButton className="settings-close" onClick={close} />
					</header>
					{children}
					{resizable && (
						<div
							aria-hidden="true"
							className="absolute right-0 bottom-0 size-3 cursor-nwse-resize touch-none border-r-2 border-b-2 border-border"
							onPointerDown={(event) => startDrag(event, true)}
						/>
					)}
				</div>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

export { FloatingWindow as FloatingEditor };
