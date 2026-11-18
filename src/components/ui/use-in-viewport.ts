import { useEffect, useRef, useState } from "react";

/** STOPGAP(journal-windowing): replace the overscan mode with TanStack Virtual. */
export function useInViewport(overscan?: string) {
	const ref = useRef<HTMLElement>(null);
	const [visible, setVisible] = useState(
		typeof IntersectionObserver === "undefined",
	);
	useEffect(() => {
		const node = ref.current;
		if (!node || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				if (overscan && !entry.isIntersecting)
					node.style.setProperty("--measured-height", `${node.offsetHeight}px`);
				setVisible(entry.isIntersecting);
			},
			overscan ? { root: node.parentElement, rootMargin: overscan } : undefined,
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, [overscan]);
	return { ref, visible };
}
