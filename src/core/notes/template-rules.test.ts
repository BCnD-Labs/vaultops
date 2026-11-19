import { expect, it, vi } from "vitest";
import { MemoryHost } from "../../host/memory-host";
import {
	loadTemplateRules,
	normalizeTemplateRules,
	resolveFolderTemplate,
	saveTemplateRules,
	TEMPLATE_RULES_FILE,
	TEMPLATES,
	trackTemplateRuleMove,
} from "./template-rules";

const meeting = `${TEMPLATES}/Meeting.vnote`;
const oneOnOne = `${TEMPLATES}/1-1.vnote`;

it("matches the deepest eligible folder and replaces duplicate assignments", () => {
	const rules = normalizeTemplateRules([
		{ folder: "", template: meeting },
		{ folder: "Meetings", template: meeting },
		{ folder: "Meetings/1-1", template: meeting },
		{ folder: "meetings/1-1", template: oneOnOne, subfolders: false },
	]);
	expect(rules).toHaveLength(3);
	expect(resolveFolderTemplate("Meetings/1-1", rules)).toBe(oneOnOne);
	expect(resolveFolderTemplate("Meetings/1-1/Archive", rules)).toBe(meeting);
	expect(resolveFolderTemplate("Other", rules)).toBe(meeting);
	expect(resolveFolderTemplate("Meetings2", rules.slice(1))).toBeUndefined();
});

it("writes atomically, recovers malformed contents, and preserves newer versions", async () => {
	const host = new MemoryHost();
	const write = vi.spyOn(host, "writeTextAtomic");
	expect(await loadTemplateRules(host)).toEqual([]);
	const rules = [{ folder: "Meetings", template: meeting, subfolders: true }];
	await saveTemplateRules(host, rules);
	expect(write).toHaveBeenCalledWith(TEMPLATE_RULES_FILE, expect.any(String));
	expect(JSON.parse(await host.readText(TEMPLATE_RULES_FILE))).toEqual({
		version: 1,
		rules,
	});
	await host.writeTextAtomic(TEMPLATE_RULES_FILE, "{damaged");
	await expect(loadTemplateRules(host)).rejects.toThrow();
	const { recoveryPath } = await saveTemplateRules(host, rules);
	expect(await host.readText(recoveryPath ?? "")).toBe("{damaged");
	expect(await loadTemplateRules(host)).toEqual(rules);
	const future = '{"version":2,"rules":[]}';
	await host.writeTextAtomic(TEMPLATE_RULES_FILE, future);
	await expect(saveTemplateRules(host, rules)).rejects.toThrow("newer");
	expect(await host.readText(TEMPLATE_RULES_FILE)).toBe(future);
});

it("tracks a folder move and template rename in saved descendant rules", async () => {
	const host = new MemoryHost();
	await saveTemplateRules(host, [
		{ folder: "Meetings/1-1", template: meeting, subfolders: true },
	]);
	await trackTemplateRuleMove(host, "folder", "Meetings", "Work/Meetings");
	await trackTemplateRuleMove(host, "template", meeting, oneOnOne);
	expect(await loadTemplateRules(host)).toEqual([
		{ folder: "Work/Meetings/1-1", template: oneOnOne, subfolders: true },
	]);
});
