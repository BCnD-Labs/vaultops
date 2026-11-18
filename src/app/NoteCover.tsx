import { type ReactNode, useEffect, useState } from "react";
import type { Host } from "../host/host";

export function NoteCover({
	host,
	path,
	children,
}: {
	host: Host;
	path: string;
	children?: ReactNode;
}) {
	const [url, setUrl] = useState<string | null>();
	const [loaded, setLoaded] = useState(false);
	useEffect(() => {
		let active = true;
		let preview: string | undefined;
		void host
			.readCover(path)
			.then((bytes) => {
				if (!active) return;
				preview = URL.createObjectURL(new Blob([bytes]));
				setUrl(preview);
			})
			.catch(() => {
				if (active) setUrl(null);
			});
		return () => {
			active = false;
			if (preview) URL.revokeObjectURL(preview);
		};
	}, [host, path]);

	return (
		<div className="note-cover" data-unavailable={url === null || undefined}>
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
