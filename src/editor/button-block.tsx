import { Node } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { Settings } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { TemplatePicker } from "../app/TemplatePicker";
import {
	type ButtonAction,
	REMOVED_BUTTON_TARGET,
	resolveButtonTarget,
} from "../core/buttons";
import type { Host } from "../host/host";
import { templateCaret } from "./insert-blocks";
import { useEditable } from "./math-block";
import type { Anchor } from "./menu-placement";
import type { TemplateRequest } from "./NoteEditor";

export interface ButtonOptions {
	commands: { id: string; label: string; available: boolean }[];
	templates?: { host: Host; onManage: () => void };
	canCreate: boolean;
}

export type RunButton = (
	action: ButtonAction,
	request: Omit<TemplateRequest, "anchor">,
) => string | undefined | Promise<string | undefined>;

export const ButtonBlockContext = createContext<{
	options?: ButtonOptions;
	run?: RunButton;
}>({});

const actions = {
	command: "Run a command",
	"insert-template": "Insert a template",
	"new-note-template": "New note from a template",
} satisfies Record<ButtonAction["action"], string>;

function ButtonBlockView({
	editor,
	node,
	getPos,
	updateAttributes,
}: NodeViewProps) {
	const { options, run } = useContext(ButtonBlockContext);
	const editable = useEditable(editor);
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<string>();
	const label =
		typeof node.attrs.label === "string" ? node.attrs.label : "Button";
	const action = (node.attrs.action ?? "command") as ButtonAction["action"];
	const target = typeof node.attrs.target === "string" ? node.attrs.target : "";
	const command = resolveButtonTarget(
		target,
		options?.commands ?? [],
		(item) => item.id,
	);
	const unavailable = () => {
		if (!target) return "Choose a button action";
		if (!run) return "This button is unavailable here";
		if (action === "command") {
			if (!command) return REMOVED_BUTTON_TARGET;
			if (!command.available) return "This command is unavailable here";
		} else if (action === "insert-template" && !editable) {
			return "Switch to editing view to insert a template";
		} else if (
			!options?.templates ||
			(action === "new-note-template" && !options.canCreate) ||
			!Object.keys(actions).includes(action)
		) {
			return "This template action is unavailable here";
		}
	};
	const reason = unavailable();

	const activate = async () => {
		const pos = getPos();
		if (!run || reason || pending || typeof pos !== "number") return;
		if (action === "insert-template" && !editor.isEditable) return;
		const { doc } = editor.state;
		const after = pos + node.nodeSize;
		setPending(true);
		setNotice(undefined);
		try {
			setNotice(
				await run(
					{ action, target },
					{
						selection: "",
						focus: () => {
							if (!editor.isDestroyed) editor.commands.focus();
						},
						insert: (nodes, cursor) => {
							if (
								editor.isDestroyed ||
								!editor.isEditable ||
								editor.state.doc !== doc ||
								!nodes.length
							)
								return false;
							const { state, view } = editor;
							const tr = closeHistory(state.tr);
							tr.insert(
								after,
								nodes.map((item) => state.schema.nodeFromJSON(item)),
							);
							tr.setSelection(
								templateCaret(tr.doc, cursor, tr.mapping.map(after)),
							);
							view.dispatch(tr.scrollIntoView());
							view.focus();
							return true;
						},
					},
				),
			);
		} catch {
			setNotice("The button action could not be completed");
		} finally {
			setPending(false);
		}
	};

	const change = (attrs: Partial<ButtonAction & { label: string }>) => {
		setNotice(undefined);
		if (editor.isEditable) updateAttributes(attrs);
	};

	return (
		<NodeViewWrapper
			contentEditable={false}
			className="flex items-center gap-2"
		>
			<span title={reason}>
				<Button
					type="button"
					disabled={!!reason || pending}
					onClick={() => void activate()}
				>
					{label || "Button"}
				</Button>
			</span>
			{editable && options && (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							aria-label="Edit button"
						>
							<Settings aria-hidden="true" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="grid gap-2">
						<Input
							aria-label="Button label"
							value={label}
							onChange={(event) => change({ label: event.target.value })}
						/>
						<select
							aria-label="Button action"
							value={action}
							onChange={(event) =>
								change({
									action: event.target.value as ButtonAction["action"],
									target: "",
								})
							}
						>
							{Object.entries(actions).map(([id, name]) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
						</select>
						{action === "command" ? (
							<select
								aria-label="Command"
								value={command ? target : ""}
								onChange={(event) => change({ target: event.target.value })}
							>
								<option value="" disabled>
									Choose command
								</option>
								{options.commands.map(({ id, label, available }) => (
									<option key={id} value={id} disabled={!available}>
										{label}
									</option>
								))}
							</select>
						) : (
							options.templates && (
								<Button
									type="button"
									variant="outline"
									onClick={(event) => {
										const { left, top, bottom } =
											event.currentTarget.getBoundingClientRect();
										setOpen(false);
										setAnchor({ left, top, bottom });
									}}
								>
									{target || "Choose template"}
								</Button>
							)
						)}
					</PopoverContent>
				</Popover>
			)}
			{editable && anchor && options?.templates && (
				<TemplatePicker
					{...options.templates}
					anchor={anchor}
					onClose={() => setAnchor(null)}
					onPick={(entry) => {
						change({ target: entry.label });
						setAnchor(null);
						setOpen(true);
					}}
				/>
			)}
			<span role="status" className="text-sm text-muted-foreground">
				{notice ?? (reason === REMOVED_BUTTON_TARGET ? reason : "")}
			</span>
		</NodeViewWrapper>
	);
}

export const ButtonBlock = Node.create({
	name: "buttonBlock",
	group: "block",
	atom: true,
	draggable: true,
	addAttributes: () => ({
		label: { default: "Button" },
		action: { default: null },
		target: { default: "" },
	}),
	parseHTML: () => [{ tag: "div[data-button-block]" }],
	renderHTML: ({ HTMLAttributes }) => [
		"div",
		{ ...HTMLAttributes, "data-button-block": "" },
	],
	renderText: ({ node }) =>
		typeof node.attrs.label === "string" ? node.attrs.label : "Button",
	addNodeView: () => ReactNodeViewRenderer(ButtonBlockView),
});
