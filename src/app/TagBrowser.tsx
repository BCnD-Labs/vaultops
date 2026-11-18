import { ChevronRight, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkTagRename, planTagRename } from "../core/notes/tag-rename";
import {
	buildTagTree,
	type TagNode,
	tagSegments,
} from "../core/notes/tag-tree";
import { notesWithTag } from "../core/notes/tags";
import { useAppearance } from "./AppearanceContext";
import { tagTone } from "./appearance";
import { TagColourPicker } from "./StylePopover";
import { ConfirmDialog, NameDialog } from "./TemplateDialogs";
import { useRovingList } from "./useRovingList";

interface Row {
	path: string;
	title: string;
	tags: string[];
}

interface Branch {
	node: TagNode;
	depth: number;
}

/** The rows on screen, top to bottom: open parents show their children. */
function visibleRows(
	nodes: TagNode[],
	open: (path: string) => boolean,
	depth = 0,
): Branch[] {
	return nodes.flatMap((node) => [
		{ node, depth },
		...(open(node.path) ? visibleRows(node.children, open, depth + 1) : []),
	]);
}

/**
 * Every tag in the vault as a tree (`work/clients` sits under `work`) with its
 * note count, a parent counting its children's notes too. Clicking a tag lists
 * its notes and those of its children. Arrow keys move between rows; Right
 * opens a parent and Left closes it (or goes up to it), like the folder tree.
 */
export function TagIndex(props: {
	rows: Row[];
	active: string | null;
	onPick: (tag: string) => void;
	/** Rename or merge the open tag across the vault; resolves with a message to show. */
	onRename?: (from: string, to: string) => Promise<string | null>;
}) {
	const tree = useMemo(() => buildTagTree(props.rows), [props.rows]);
	const { appearance, setTag } = useAppearance();
	// Parents of the picked tag start open so it is visible.
	const [opened, setOpened] = useState<Record<string, boolean>>(() => {
		const parts = tagSegments(props.active ?? "");
		return Object.fromEntries(
			parts.slice(0, -1).map((_, i) => [
				parts
					.slice(0, i + 1)
					.join("/")
					.toLowerCase(),
				true,
			]),
		);
	});
	const isOpen = (path: string) => opened[path.toLowerCase()] === true;
	const setOpen = (path: string, value: boolean) =>
		setOpened((now) => ({ ...now, [path.toLowerCase()]: value }));
	const shown = visibleRows(tree, isOpen);
	const roving = useRovingList(
		shown.map(({ node }) => node.path),
		props.active,
		(event, key) => {
			if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
				return false;
			const at = shown.findIndex(({ node }) => node.path === key);
			const row = shown[at];
			if (!row) return false;
			if (event.key === "ArrowRight" && row.node.children.length > 0) {
				if (isOpen(key)) roving.focusKey(row.node.children[0]?.path ?? key);
				else setOpen(key, true);
				return true;
			}
			if (event.key === "ArrowLeft") {
				if (isOpen(key) && row.node.children.length > 0) setOpen(key, false);
				else {
					const parent = shown
						.slice(0, at)
						.reverse()
						.find((r) => r.depth === row.depth - 1);
					if (parent) roving.focusKey(parent.node.path);
				}
				return true;
			}
			return false;
		},
	);
	if (tree.length === 0) return null;
	return (
		<>
			<nav
				className="tag-index"
				aria-label="Tags"
				ref={roving.rootRef}
				onKeyDown={roving.onKeyDown}
			>
				{shown.map(({ node, depth }) => (
					<TagColourPicker
						key={node.path.toLowerCase()}
						tone={appearance.tags[node.path.toLowerCase()]}
						onChange={(tone) => setTag(node.path, tone)}
					>
						<div
							className="tree-row tag-row"
							style={{ paddingInlineStart: `${depth * 14}px` }}
						>
							{node.children.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label={`Toggle tag ${node.path}`}
									aria-expanded={isOpen(node.path)}
									tabIndex={-1}
									onClick={() => setOpen(node.path, !isOpen(node.path))}
								>
									<ChevronRight
										className={`tree-icon tree-chevron${isOpen(node.path) ? " is-open" : ""}`}
									/>
								</Button>
							) : (
								<span className="tree-icon tag-spacer" aria-hidden="true" />
							)}
							<button
								type="button"
								className="sidebar-row tag-button"
								title={`#${node.path}`}
								aria-pressed={
									props.active?.toLowerCase() === node.path.toLowerCase()
								}
								onClick={() => props.onPick(node.path)}
								{...roving.itemProps(node.path)}
							>
								<span className="tree-name">
									<span
										className="tag-pill"
										data-tone={tagTone(node.path, appearance)}
									>
										#{node.name}
									</span>
								</span>{" "}
								<span className="sidebar-count">{node.count}</span>
							</button>
						</div>
					</TagColourPicker>
				))}
			</nav>
			{props.active && props.onRename && (
				<RenameTag
					rows={props.rows}
					tag={props.active}
					onRename={props.onRename}
				/>
			)}
		</>
	);
}

/** "Rename or merge…" for the picked tag: ask the new name, then confirm with the note count. */
function RenameTag(props: {
	rows: Row[];
	tag: string;
	onRename: (from: string, to: string) => Promise<string | null>;
}) {
	const [asking, setAsking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [target, setTarget] = useState<string | null>(null);
	const [result, setResult] = useState<string | null>(null);
	const plan = target ? planTagRename(props.rows, props.tag, target) : null;
	const merging =
		target !== null &&
		props.rows.some((r) =>
			r.tags.some((t) => t.toLowerCase() === target.toLowerCase()),
		);
	const count = plan?.paths.length ?? 0;
	return (
		<>
			<Button size="sm" variant="secondary" onClick={() => setAsking(true)}>
				Rename or merge #{props.tag}…
			</Button>
			{result && <p role="status">{result}</p>}
			<NameDialog
				open={asking}
				title="Rename or merge tag"
				description={`New name for #${props.tag} and every tag below it. Use an existing tag's name to merge into it.`}
				label="New tag name"
				initial={props.tag}
				confirmLabel="Continue"
				error={error}
				onCancel={() => {
					setAsking(false);
					setError(null);
				}}
				onSubmit={(name) => {
					const checked = checkTagRename(props.tag, name);
					if (!checked.ok) return setError(checked.message);
					setError(null);
					setAsking(false);
					setTarget(checked.to);
				}}
			/>
			<ConfirmDialog
				open={target !== null}
				title={`${merging ? "Merge" : "Rename"} #${props.tag} into #${target}?`}
				description={`${count === 1 ? "1 note will change." : `${count} notes will change.`}${
					plan && plan.readOnly.length > 0
						? ` ${plan.readOnly.length} read-only note(s) will be left as they are.`
						: ""
				}`}
				confirmLabel={merging ? "Merge" : "Rename"}
				onCancel={() => setTarget(null)}
				onConfirm={() => {
					const to = target;
					setTarget(null);
					if (to && count > 0)
						void props.onRename(props.tag, to).then(setResult);
				}}
			/>
		</>
	);
}

/** The notes that carry one tag, in place of the folder tree. */
export function TaggedNotes(props: {
	rows: Row[];
	tag: string;
	livePath: string | null;
	onOpen: (path: string) => void;
	onClear: () => void;
}) {
	const notes = notesWithTag(props.rows, props.tag);
	return (
		<div className="tagged">
			<p className="tagged-title">
				Notes tagged <strong>{props.tag}</strong>
			</p>
			<ul className="note-list">
				{notes.map((n) => (
					<li key={n.path} title={n.path}>
						<button
							type="button"
							aria-current={n.path === props.livePath}
							onClick={() => props.onOpen(n.path)}
						>
							<FileText className="tree-icon" aria-hidden="true" />
							<span className="tree-name">{n.title}</span>
						</button>
					</li>
				))}
			</ul>
			{notes.length === 0 && (
				<p className="read-only-tag">No notes carry this tag.</p>
			)}
			<Button size="sm" variant="secondary" onClick={props.onClear}>
				Show all notes
			</Button>
		</div>
	);
}
