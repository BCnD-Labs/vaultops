import { useMemo, useState } from "react";
import {
	ICON_BY_NAME,
	ICON_CATEGORIES,
	pushRecentIcon,
	readRecentIcons,
	searchIcons,
} from "./iconCatalog";

const COLS = 8;
const CELL = 32;
const VIEWPORT = 192;
const OVERSCAN = 2;

/** Only the rows in view are drawn, so the full lucide set stays fast. */
export function VirtualIconGrid({
	names,
	selected,
	onPick,
}: {
	names: readonly string[];
	selected: string | undefined;
	onPick: (name: string) => void;
}) {
	const [top, setTop] = useState(0);
	const rows = Math.ceil(names.length / COLS);
	const first = Math.max(0, Math.floor(top / CELL) - OVERSCAN);
	const last = Math.min(rows, Math.ceil((top + VIEWPORT) / CELL) + OVERSCAN);
	const slice = names.slice(first * COLS, last * COLS);
	return (
		<div
			className="icon-grid"
			style={{ height: VIEWPORT }}
			onScroll={(e) => setTop(e.currentTarget.scrollTop)}
		>
			<div style={{ height: rows * CELL, position: "relative" }}>
				<div
					className="icon-grid-rows"
					style={{ transform: `translateY(${first * CELL}px)` }}
				>
					{slice.map((name) => {
						const Icon = ICON_BY_NAME.get(name);
						if (!Icon) return null;
						return (
							<button
								key={name}
								type="button"
								className="style-icon"
								aria-label={`Icon ${name}`}
								aria-pressed={selected === name}
								title={name}
								onClick={() => onPick(name)}
							>
								<Icon className="tree-icon" aria-hidden="true" />
							</button>
						);
					})}
				</div>
			</div>
			{names.length === 0 && <p className="icon-empty">No icons match.</p>}
		</div>
	);
}

/** Search, a recent row, category chips and the grid. */
export function IconPicker({
	selected,
	onPick,
}: {
	/** The saved icon's lucide name. */
	selected: string | undefined;
	onPick: (name: string) => void;
}) {
	const [query, setQuery] = useState("");
	const [category, setCategory] = useState<string>("common");
	const [recent, setRecent] = useState<string[]>(() => readRecentIcons());
	const names = useMemo(() => {
		if (query.trim()) return searchIcons(query);
		if (category === "all") return searchIcons("");
		const cat = ICON_CATEGORIES.find((c) => c.id === category);
		return (cat?.names ?? []).filter((n) => ICON_BY_NAME.has(n));
	}, [query, category]);
	const pick = (name: string) => {
		setRecent(pushRecentIcon(name));
		onPick(name);
	};
	return (
		<div className="icon-picker">
			<input
				type="search"
				className="icon-search"
				aria-label="Search icons"
				placeholder="Search icons"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
			/>
			{recent.length > 0 && !query.trim() && (
				<>
					<p className="style-heading">Recent</p>
					<div className="icon-recent">
						{recent.map((name) => {
							const Icon = ICON_BY_NAME.get(name);
							return Icon ? (
								<button
									key={name}
									type="button"
									className="style-icon"
									aria-label={`Recent icon ${name}`}
									aria-pressed={selected === name}
									title={name}
									onClick={() => pick(name)}
								>
									<Icon className="tree-icon" aria-hidden="true" />
								</button>
							) : null;
						})}
					</div>
				</>
			)}
			{!query.trim() && (
				<fieldset className="icon-categories" aria-label="Icon categories">
					{[...ICON_CATEGORIES, { id: "all", label: "All" }].map((c) => (
						<button
							key={c.id}
							type="button"
							className="style-mode"
							aria-pressed={category === c.id}
							onClick={() => setCategory(c.id)}
						>
							{c.label}
						</button>
					))}
				</fieldset>
			)}
			<VirtualIconGrid names={names} selected={selected} onPick={pick} />
		</div>
	);
}
