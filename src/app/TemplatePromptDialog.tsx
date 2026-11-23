import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Note } from "../core/note-format";
import type { PropertyValue } from "../core/notes/properties";
import {
	extractPrompts,
	fillTemplate,
	type TemplatePrompt,
} from "../core/notes/template-prompts";
import { Control } from "./PropertiesPanel";
import { PROPERTY_ICONS } from "./property-meta";
import { templateFormats, templateWeekStart } from "./settings";
import "./pane.css";
import "./templates.css";

type Answers = Record<string, PropertyValue>;
type Request = {
	name: string;
	selection?: string;
	/** A type's fields: asked in the same dialog, after the template's own questions. */
	fields?: TemplatePrompt[];
	onFill: (filled: ReturnType<typeof fillTemplate>, answers: Answers) => void;
	onCancel?: () => void;
};

/** Run immediately when there is nothing to ask. */
export function useTemplatePrompt() {
	const [dialog, setDialog] = useState<React.ReactNode>(null);
	const ask = (template: Note, title: string, request: Request) => {
		const now = new Date();
		const weekStartsOn = templateWeekStart();
		const formats = templateFormats();
		const asked = extractPrompts(template, now, weekStartsOn);
		const prompts = [
			...asked,
			...(request.fields ?? []).filter(
				(f) =>
					!asked.some((p) => p.label.toLowerCase() === f.label.toLowerCase()),
			),
		];
		const fill = (answers?: Answers) => {
			setDialog(null);
			request.onFill(
				fillTemplate(template, title, {
					now,
					weekStartsOn,
					formats,
					answers,
					selection: request.selection,
				}),
				answers ?? {},
			);
		};
		if (!prompts.length) fill();
		else {
			const focused = document.activeElement;
			setDialog(
				<TemplatePromptDialog
					name={request.name}
					prompts={prompts}
					onSubmit={fill}
					onCancel={() => {
						setDialog(null);
						if (request.onCancel) request.onCancel();
						else if (focused instanceof HTMLElement)
							requestAnimationFrame(() => focused.focus());
					}}
				/>,
			);
		}
	};
	return { ask, dialog };
}

export function TemplatePromptDialog({
	name,
	prompts,
	onSubmit,
	onCancel,
}: {
	name: string;
	prompts: ReturnType<typeof extractPrompts>;
	onSubmit: (answers: Answers) => void;
	onCancel: () => void;
}) {
	const [answers, setAnswers] = useState<Answers>({});
	const latest = useRef(answers);
	return (
		<Dialog open onOpenChange={(open) => !open && onCancel()}>
			<DialogContent
				aria-describedby={undefined}
				className="template-prompt-dialog max-h-[85vh] overflow-y-auto"
				showClose={false}
				onOpenAutoFocus={(event) => {
					const first = (
						event.target as HTMLElement
					).querySelector<HTMLElement>(
						'.prop-row input, .prop-row button[tabindex="0"], .prop-row [role=combobox]',
					);
					if (first) {
						event.preventDefault();
						first.focus();
					}
				}}
			>
				<form
					className="grid gap-3"
					noValidate
					onKeyDown={(event) => {
						if (
							event.key === "Enter" &&
							event.defaultPrevented &&
							!event.nativeEvent.isComposing &&
							event.target instanceof HTMLInputElement
						)
							event.currentTarget.requestSubmit();
					}}
					onSubmit={(event) => {
						event.preventDefault();
						if (document.activeElement instanceof HTMLElement)
							document.activeElement.blur();
						onSubmit(latest.current);
					}}
				>
					<DialogTitle>{name}</DialogTitle>
					<div className="props !m-0">
						{prompts.map(({ label, type, options, default: initial }) => {
							const Icon = PROPERTY_ICONS[type];
							return (
								<div className="prop-row" key={label}>
									<span className="prop-type-icon">
										<Icon aria-hidden="true" />
									</span>
									<span className="prop-name">{label}</span>
									<Control
										item={{
											known: true,
											name: label,
											type,
											options,
											value: Object.hasOwn(answers, label)
												? (answers[label] ?? null)
												: initial,
										}}
										editable
										onValue={(value) => {
											latest.current = { ...latest.current, [label]: value };
											setAnswers(latest.current);
										}}
									/>
								</div>
							);
						})}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onCancel}>
							Cancel
						</Button>
						<Button type="submit">Continue</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
