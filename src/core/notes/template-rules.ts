import type { Host } from "../../host/host";
import { NOTE_EXT } from "../file-name/file-name";
import { isInsideVaultOps } from "../vault/vault";
import { checkVaultPath, folderDepth, nameKey } from "../vault-path/vault-path";
import { movedPath, within } from "./folders";
import { copyToRecovery } from "./trash";

export const TEMPLATES = ".vaultops/templates";
export const TEMPLATE_RULES_FILE = `${TEMPLATES}/rules.json`;

export interface FolderTemplateRule {
	folder: string;
	template: string;
	subfolders: boolean;
}

export function normalizeTemplateRules(rules: unknown[]): FolderTemplateRule[] {
	const byFolder = new Map<string, FolderTemplateRule>();
	for (const rule of rules) {
		if (typeof rule !== "object" || rule === null)
			throw new Error("Invalid folder template rule.");
		const {
			folder,
			template,
			subfolders = true,
		} = rule as Record<string, unknown>;
		if (
			typeof folder !== "string" ||
			!checkVaultPath(folder, { allowRoot: true }).ok ||
			isInsideVaultOps(folder) ||
			typeof template !== "string" ||
			!checkVaultPath(template).ok ||
			!template.startsWith(`${TEMPLATES}/`) ||
			!template.toLowerCase().endsWith(NOTE_EXT) ||
			typeof subfolders !== "boolean"
		)
			throw new Error("Invalid folder template rule.");
		byFolder.set(nameKey(folder), { folder, template, subfolders });
	}
	return [...byFolder.values()];
}

function parse(text: string): FolderTemplateRule[] {
	const value = JSON.parse(text);
	if (value?.version !== 1 || !Array.isArray(value.rules))
		throw new Error("The folder template rules could not be read.");
	return normalizeTemplateRules(value.rules);
}

export async function loadTemplateRules(
	host: Host,
): Promise<FolderTemplateRule[]> {
	if ((await host.kindOf(TEMPLATE_RULES_FILE)) === null) return [];
	return parse(await host.readText(TEMPLATE_RULES_FILE));
}

export async function saveTemplateRules(
	host: Host,
	rules: readonly FolderTemplateRule[],
	now = new Date(),
): Promise<{ recoveryPath?: string }> {
	const normalized = normalizeTemplateRules([...rules]);
	let recoveryPath: string | undefined;
	if ((await host.kindOf(TEMPLATE_RULES_FILE)) !== null) {
		const text = await host.readText(TEMPLATE_RULES_FILE);
		try {
			parse(text);
		} catch {
			let version: unknown;
			try {
				version = JSON.parse(text)?.version;
			} catch {
				// Invalid JSON is copied to recovery below.
			}
			if (typeof version === "number" && version > 1)
				throw new Error(
					"The folder template rules belong to a newer app version.",
				);
			({ recoveryPath } = await copyToRecovery(host, text, "rules.json", now));
		}
	}
	await host.makeFolder(TEMPLATES);
	await host.writeTextAtomic(
		TEMPLATE_RULES_FILE,
		`${JSON.stringify({ version: 1, rules: normalized }, null, 2)}\n`,
	);
	return recoveryPath ? { recoveryPath } : {};
}

/** Resolve the rule before reading its template, even if that template is gone. */
export function resolveFolderTemplate(
	folder: string,
	rules: readonly FolderTemplateRule[],
): string | undefined {
	let best: FolderTemplateRule | undefined;
	for (const rule of rules) {
		const matches =
			nameKey(folder) === nameKey(rule.folder) ||
			(rule.subfolders && (rule.folder === "" || within(folder, rule.folder)));
		if (
			matches &&
			(!best || folderDepth(rule.folder) > folderDepth(best.folder))
		)
			best = rule;
	}
	return best?.template;
}

/** Keep references to renamed folders, templates, and their descendants. */
export async function trackTemplateRuleMove(
	host: Host,
	field: "folder" | "template",
	from: string,
	to: string,
): Promise<string | undefined> {
	if (from === to) return;
	try {
		const rules = await loadTemplateRules(host);
		const next = rules.map((rule) => {
			const path = movedPath(rule[field], from, to);
			return path === rule[field] ? rule : { ...rule, [field]: path };
		});
		if (next.some((rule, i) => rule !== rules[i])) {
			// A moved rule takes precedence over a stale rule at its destination.
			await saveTemplateRules(host, [
				...next.filter((rule, i) => rule === rules[i]),
				...next.filter((rule, i) => rule !== rules[i]),
			]);
		}
	} catch {
		return "The item moved, but its folder template rules could not be updated.";
	}
}
