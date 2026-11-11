import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { Host } from "../host/host";
import {
	APPEARANCE_PATH,
	type Appearance,
	EMPTY_APPEARANCE,
	type ItemStyle,
	parseAppearance,
	serializeAppearance,
	type Tone,
} from "./appearance";

interface AppearanceApi {
	appearance: Appearance;
	/** Set or clear (null) the icon, colour and mode of a folder or note. */
	setItem: (path: string, style: ItemStyle | null) => void;
	/** Set or clear (null) the colour of a tag. */
	setTag: (tag: string, tone: Tone | null) => void;
}

const noop = () => {};

/** Without a provider (tests, previews) everything is plain and nothing is saved. */
export const AppearanceContext = createContext<AppearanceApi>({
	appearance: EMPTY_APPEARANCE,
	setItem: noop,
	setTag: noop,
});

export const useAppearance = () => useContext(AppearanceContext);

/**
 * Loads `.vaultops/appearance.json` and saves it after each change. A read-only
 * vault refuses the write; the choice then lasts until the app closes.
 */
export function AppearanceProvider({
	host,
	children,
}: {
	host: Host;
	children: ReactNode;
}) {
	const [appearance, setAppearance] = useState<Appearance>(EMPTY_APPEARANCE);
	const latest = useRef(appearance);
	latest.current = appearance;
	// Writes go one after another, so a quick second change never races the first.
	const queue = useRef<Promise<void>>(Promise.resolve());

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const kind = await host.kindOf(APPEARANCE_PATH);
				const text =
					kind === "file" ? await host.readText(APPEARANCE_PATH) : null;
				if (!cancelled) setAppearance(parseAppearance(text));
			} catch {
				if (!cancelled) setAppearance(EMPTY_APPEARANCE);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [host]);

	const commit = useCallback(
		(next: Appearance) => {
			setAppearance(next);
			latest.current = next;
			queue.current = queue.current.then(async () => {
				try {
					await host.makeFolder(".vaultops");
					await host.writeTextAtomic(
						APPEARANCE_PATH,
						serializeAppearance(latest.current),
					);
				} catch {
					/* Read-only vault or a full disk: the choice stays for this session. */
				}
			});
		},
		[host],
	);

	const api = useMemo<AppearanceApi>(
		() => ({
			appearance,
			setItem: (path, style) => {
				const items = { ...latest.current.items };
				if (style && (style.icon || style.tone)) items[path] = style;
				else delete items[path];
				commit({ ...latest.current, items });
			},
			setTag: (tag, tone) => {
				const tags = { ...latest.current.tags };
				if (tone) tags[tag.toLowerCase()] = tone;
				else delete tags[tag.toLowerCase()];
				commit({ ...latest.current, tags });
			},
		}),
		[appearance, commit],
	);

	return (
		<AppearanceContext.Provider value={api}>
			{children}
		</AppearanceContext.Provider>
	);
}
