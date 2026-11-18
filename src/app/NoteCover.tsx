import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { displayBox, type Size } from "../core/images/display-copy";
import type { Host } from "../host/host";
import { displayImage } from "./display-image";

/** The banner's height in CSS pixels (`.note-cover` in pane.css). */
const COVER_HEIGHT = 200;

export function NoteCover({
	host,
	path,
	children,
}: {
	host: Host;
	path: string;
	children?: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [box, setBox] = useState<Size | null>(null);
	const [url, setUrl] = useState<string | null>();
	const [loaded, setLoaded] = useState(false);

	// The largest box the banner has needed so far; it only grows, so making
	// the window smaller never asks for a new copy.
	useLayoutEffect(() => {
		const element = ref.current;
		if (!element) return;
		const measure = () => {
			const next = displayBox(
				{
					width: element.clientWidth,
					height: element.clientHeight || COVER_HEIGHT,
				},
				window.devicePixelRatio,
			);
			setBox((prev) =>
				prev && prev.width >= next.width && prev.height >= next.height
					? prev
					: next,
			);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (!box) return;
		let active = true;
		let preview: string | undefined;
		void displayImage(host, path, box)
			.then((blob) => {
				if (!active) return;
				preview = URL.createObjectURL(blob);
				setUrl(preview);
			})
			.catch(() => {
				if (active) setUrl(null);
			});
		return () => {
			active = false;
			if (preview) URL.revokeObjectURL(preview);
		};
	}, [host, path, box]);

	return (
		<div
			ref={ref}
			className="note-cover"
			data-unavailable={url === null || undefined}
		>
			{url && (
				<img
					src={url}
					alt=""
					data-loaded={loaded || undefined}
					onLoad={() => setLoaded(true)}
					onError={() => setUrl(null)}
				/>
			)}
			{url === null && <span>Cover unavailable</span>}
			{children}
		</div>
	);
}
