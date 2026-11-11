import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { matchesQuery } from "../core/settings/registry";
import {
	bindingFromEvent,
	bindingProblem,
	EDITOR_SHORTCUTS,
	findConflict,
	formatKeys,
	SHORTCUT_COMMANDS,
	type ShortcutCommand,
	shortcutKey,
} from "../core/settings/shortcuts";
import { settings } from "./settings";
import {
	commandBinding,
	isMacPlatform,
	setRecordingShortcut,
} from "./shortcuts";

const save = (id: string, value: string) =>
	(settings.set as (key: string, value: unknown) => unknown)(
		shortcutKey(id),
		value,
	);

/** One command: its binding, a button to record a new one, and a reset. */
function ShortcutRow({ command }: { command: ShortcutCommand }) {
	const mac = isMacPlatform();
	const [recording, setRecording] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const binding = commandBinding(command.id);
	const other = findConflict(command.id, binding, commandBinding);

	useEffect(() => {
		if (!recording) return;
		setRecordingShortcut(true);
		const onKey = (event: KeyboardEvent) => {
			// Own every key while recording, so nothing else (a command, or Esc
			// closing the window) reacts to it.
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.isComposing || event.repeat) return;
			const bare = !(
				event.metaKey ||
				event.ctrlKey ||
				event.altKey ||
				event.shiftKey
			);
			if (bare && event.key === "Escape") {
				setRecording(false);
				return;
			}
			if (bare && (event.key === "Backspace" || event.key === "Delete")) {
				save(command.id, "");
				setMessage(null);
				setRecording(false);
				return;
			}
			const next = bindingFromEvent(event, mac);
			if (next === null) return;
			const problem = bindingProblem(next);
			if (problem) {
				setMessage(problem);
				return;
			}
			const clash = findConflict(command.id, next, commandBinding);
			if (clash) {
				setMessage(
					`${formatKeys(next, mac)} is already used by “${clash.label}”. Change or clear that one first.`,
				);
				setRecording(false);
				return;
			}
			save(command.id, next);
			setMessage(null);
			setRecording(false);
		};
		window.addEventListener("keydown", onKey, true);
		return () => {
			window.removeEventListener("keydown", onKey, true);
			setRecordingShortcut(false);
		};
	}, [recording, command.id, mac]);

	return (
		<div className="settings-row" data-setting={shortcutKey(command.id)}>
			<div className="settings-row-text">
				<span>{command.label}</span>
				<p className="settings-note">{command.where}</p>
				{recording && (
					<p className="settings-note">
						Press the new keys. Esc cancels, Backspace clears.
					</p>
				)}
				{message && (
					<p className="settings-note" role="alert">
						{message}
					</p>
				)}
				{!message && other && (
					<p className="settings-note" role="alert">
						Also used by “{other.label}”. Change one of them.
					</p>
				)}
			</div>
			<div className="settings-actions">
				<button
					type="button"
					className="settings-shortcut"
					aria-label={`Change shortcut for ${command.label}`}
					onClick={() => {
						setMessage(null);
						setRecording(true);
					}}
					onBlur={() => setRecording(false)}
				>
					<Kbd>
						{recording
							? "Press keys…"
							: binding
								? formatKeys(binding, mac)
								: "None"}
					</Kbd>
				</button>
				<Button
					variant="ghost"
					aria-label={`Reset shortcut for ${command.label}`}
					disabled={settings.isDefault(shortcutKey(command.id))}
					onClick={() => {
						setMessage(null);
						const clash = findConflict(
							command.id,
							command.keys,
							commandBinding,
						);
						if (clash) {
							setMessage(
								`${formatKeys(command.keys, mac)} is already used by “${clash.label}”. Change or clear that one first.`,
							);
							return;
						}
						settings.reset(shortcutKey(command.id));
					}}
				>
					Reset
				</Button>
			</div>
		</div>
	);
}

/**
 * The shortcut commands by group, then the editor's own keys (read-only).
 * `filter` narrows both by name or keys.
 */
export function ShortcutsList({ filter = "" }: { filter?: string }) {
	const mac = isMacPlatform();
	const commands = SHORTCUT_COMMANDS.filter((c) =>
		matchesQuery(
			{
				label: c.label,
				description: c.where,
				group: c.section,
				keywords: [c.keys, formatKeys(commandBinding(c.id), mac)],
			},
			filter,
		),
	);
	const editor = EDITOR_SHORTCUTS.filter((s) =>
		matchesQuery(
			{ label: s.label, group: "Editor", keywords: [s.keys] },
			filter,
		),
	);
	const groups = [...new Set(commands.map((c) => c.section))];
	return (
		<>
			{groups.map((group) => (
				<div key={group}>
					<h3 className="section-label">{group}</h3>
					{commands
						.filter((c) => c.section === group)
						.map((c) => (
							<ShortcutRow key={c.id} command={c} />
						))}
				</div>
			))}
			{editor.length > 0 && (
				<div>
					<h3 className="section-label">Editor</h3>
					{editor.map((s) => (
						<div className="settings-row" key={s.id}>
							<div className="settings-row-text">
								<span>{s.label}</span>
							</div>
							<Kbd>{formatKeys(s.keys, mac)}</Kbd>
						</div>
					))}
					<p className="settings-note">
						The editor's keys are part of the editor and cannot be changed yet.
					</p>
				</div>
			)}
		</>
	);
}
