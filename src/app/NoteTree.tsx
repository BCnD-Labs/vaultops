import { ChevronRight, FileText, Folder } from "lucide-react";
import { useEffect, useState } from "react";
import { ancestorsOf, type TreeNode } from "../core/notes/tree";

interface Props {
	nodes: TreeNode[];
	/** The note that is open, if any; its folders are shown open. */
	livePath: string | null;
	onOpen: (path: string) => void;
}

/** Folders and notes of the vault. Read-only for now: it only opens notes. */
export function NoteTree({ nodes, livePath, onOpen }: Props) {
	const [open, setOpen] = useState<Set<string>>(
		() => new Set(livePath ? ancestorsOf(livePath) : []),
	);

	// Opening a note (or creating one) shows where it lives.
	useEffect(() => {
		if (livePath === null) return;
		setOpen((now) => {
			const next = new Set(now);
			for (const folder of ancestorsOf(livePath)) next.add(folder);
			return next.size === now.size ? now : next;
		});
	}, [livePath]);

	const toggle = (path: string) =>
		setOpen((now) => {
			const next = new Set(now);
			if (!next.delete(path)) next.add(path);
			return next;
		});

	return (
		<Branch
			nodes={nodes}
			open={open}
			livePath={livePath}
			onToggle={toggle}
			onOpen={onOpen}
		/>
	);
}

interface BranchProps {
	nodes: TreeNode[];
	open: Set<string>;
	livePath: string | null;
	onToggle: (path: string) => void;
	onOpen: (path: string) => void;
}

function Branch({ nodes, open, livePath, onToggle, onOpen }: BranchProps) {
	return (
		<ul className="note-list">
			{nodes.map((node) => {
				if (node.kind === "note") {
					return (
						<li key={node.path} title={node.path}>
							<button
								type="button"
								aria-current={node.path === livePath}
								onClick={() => onOpen(node.path)}
							>
								<span className="tree-icon" aria-hidden="true" />
								<FileText className="tree-icon" aria-hidden="true" />
								<span className="tree-name">{node.name}</span>
								{node.readOnly && (
									<span className="read-only-tag">read-only</span>
								)}
							</button>
						</li>
					);
				}
				const isOpen = open.has(node.path);
				return (
					<li key={`folder:${node.path}`} title={node.path}>
						<button
							type="button"
							className="tree-folder"
							aria-expanded={isOpen}
							onClick={() => onToggle(node.path)}
						>
							<ChevronRight
								className={`tree-icon tree-chevron${isOpen ? " is-open" : ""}`}
								aria-hidden="true"
							/>
							<Folder className="tree-icon" aria-hidden="true" />
							<span className="tree-name">{node.name}</span>
						</button>
						{isOpen &&
							(node.children.length > 0 ? (
								<Branch
									nodes={node.children}
									open={open}
									livePath={livePath}
									onToggle={onToggle}
									onOpen={onOpen}
								/>
							) : (
								<p className="read-only-tag tree-empty">Empty</p>
							))}
					</li>
				);
			})}
		</ul>
	);
}
