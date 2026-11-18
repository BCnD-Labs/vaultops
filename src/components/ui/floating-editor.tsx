import * as Dialog from "@radix-ui/react-dialog";
import { Pin } from "lucide-react";
import {
	type ReactNode,
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from "react";
import { Button } from "./button";
import { CloseButton } from "./close-button";
import "./floating-editor.css";

const clamp = (n: number, max: number) => Math.max(8, Math.min(n, max - 8));
const prevent = (event: Event) => event.preventDefault();
function focusFirst(panel: HTMLElement | null) {
	if (!panel?.contains(document.activeElement))
		panel?.querySelector("button")?.focus();
}

/** A nonmodal window for live or historical content. */
export function FloatingEditor({
	anchor,
	title,
	open,
	top,
	editing,
	focusRequest,
	onClose,
	onExited,
	children,
}: {
	anchor: HTMLElement;
	title: string;
	open: boolean;
	top: boolean;
	editing: boolean;
	focusRequest?: object;
	onClose: () => void;
	onExited: (restoreFocus: boolean) => void;
	children: ReactNode;
}) {
	const panel = useRef<HTMLDivElement>(null);
	const drag = useRef<{ x: number; y: number } | null>(null);
	const restore = useRef(false);
	const hovered = useRef(!focusRequest);
	const [pinned, pin] = useState(false);
	const [position, move] = useState(() => {
		const { left, bottom, top } = anchor.getBoundingClientRect();
		return {
			left: clamp(left, innerWidth - 380),
			top: clamp(
				bottom + 278 < innerHeight ? bottom + 6 : top - 276,
				innerHeight - 270,
			),
		};
	});
	const expire = useEffectEvent(onClose);

	useEffect(() => {
		if (focusRequest) focusFirst(panel.current);
	}, [focusRequest]);

	useEffect(() => {
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

	return (
		<Dialog.Root
			open={open}
			modal={false}
			onOpenChange={(next) => {
				if (next) return;
				restore.current = true;
				onClose();
			}}
		>
			<Dialog.Portal>
				<Dialog.Content
					ref={panel}
					aria-describedby={undefined}
					inert={!open}
					className="floating-editor fixed z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-lg outline-none"
					style={position}
					onInteractOutside={prevent}
					onEscapeKeyDown={(event) => {
						if (event.isComposing) prevent(event);
					}}
					onOpenAutoFocus={(event) => {
						prevent(event);
						if (focusRequest) focusFirst(panel.current);
					}}
					onCloseAutoFocus={(event) => {
						prevent(event);
						onExited(restore.current);
					}}
				>
					<header
						className="flex cursor-grab touch-none select-none items-center gap-2 border-b px-2"
						onPointerDown={(event) => {
							if (
								event.button !== 0 ||
								(event.target as Element).closest("button")
							)
								return;
							event.preventDefault();
							drag.current = {
								x: event.clientX - position.left,
								y: event.clientY - position.top,
							};
							event.currentTarget.setPointerCapture(event.pointerId);
						}}
						onPointerMove={(event) => {
							if (!drag.current || !panel.current) return;
							const { offsetWidth, offsetHeight } = panel.current;
							move({
								left: clamp(
									event.clientX - drag.current.x,
									innerWidth - offsetWidth,
								),
								top: clamp(
									event.clientY - drag.current.y,
									innerHeight - offsetHeight,
								),
							});
						}}
						onLostPointerCapture={() => {
							drag.current = null;
						}}
					>
						<Dialog.Title className="flex-1 truncate text-sm font-medium">
							{title}
						</Dialog.Title>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Pin window"
							aria-pressed={pinned}
							onClick={() => pin(!pinned)}
						>
							<Pin aria-hidden="true" />
						</Button>
						<Dialog.Close asChild>
							<CloseButton />
						</Dialog.Close>
					</header>
					{children}
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
