import { useEffect, useRef, useState } from "react";

export function useInViewport() {
	const ref = useRef<HTMLElement>(null);
	const [visible, setVisible] = useState(
		typeof IntersectionObserver === "undefined",
	);
	useEffect(() => {
		const node = ref.current;
		if (!node || typeof IntersectionObserver === "undefined") return;
		const observer = new IntersectionObserver(([entry]) => {
			if (entry) setVisible(entry.isIntersecting);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return { ref, visible };
}
