import { useEffect, useRef, useState } from "react";

/** STOPGAP(journal-windowing): use the approved TanStack virtualizer once it is installed. */
export function useNearViewport() {
	const ref = useRef<HTMLElement>(null);
	const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
	useEffect(() => {
		const row = ref.current;
		if (!row || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry) return;
				if (!entry.isIntersecting)
					row.style.setProperty("--measured-height", `${row.offsetHeight}px`);
				setNear(entry.isIntersecting);
			},
			{ root: row.parentElement, rootMargin: "400px 0px" },
		);
		observer.observe(row);
		return () => observer.disconnect();
	}, []);
	return { ref, near };
}
