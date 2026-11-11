// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Note } from "../core/note-format";
import { saveTemplate } from "../core/notes/templates";
import { openVault } from "../core/vault/vault";
import { MemoryHost } from "../host/memory-host";
import { TemplatePicker } from "./TemplatePicker";

afterEach(cleanup);

const note = (text: string): Note => ({
	header: { format: "vaultops-note", v: 1, noteId: "n", title: "T" },
	blocks: [
		{
			id: "a",
			type: "paragraph",
			parent: null,
			content: [{ type: "text", text }],
		},
	],
});

async function setup() {
	const host = new MemoryHost();
	await openVault(host);
	await saveTemplate(host, "Lecture Notes", note("one"), {
		folder: "01 - School",
	});
	await saveTemplate(host, "Bug Report", note("two"), {
		folder: "02 - Projects",
	});
	await saveTemplate(host, "Standup", note("three"));
	const onPick = vi.fn();
	const onManage = vi.fn();
	const onClose = vi.fn();
	render(
		<TemplatePicker
			host={host}
			anchor={{ left: 10, top: 10, bottom: 30 }}
			onPick={onPick}
			onManage={onManage}
			onClose={onClose}
		/>,
	);
	return { host, onPick, onManage, onClose };
}

it("lists every template by its folder and name, with a search box", async () => {
	await setup();
	expect(await screen.findByText("/01 - School/Lecture Notes")).toBeTruthy();
	expect(screen.getByText("/02 - Projects/Bug Report")).toBeTruthy();
	expect(screen.getByText("/Standup")).toBeTruthy();
	expect(
		screen.getByRole("combobox", { name: "Search templates" }),
	).toBeTruthy();
});

it("narrows the list as you type, matching the folder too", async () => {
	await setup();
	await screen.findByText("/Standup");
	await userEvent.type(
		screen.getByRole("combobox", { name: "Search templates" }),
		"school",
	);
	expect(screen.getByText("/01 - School/Lecture Notes")).toBeTruthy();
	expect(screen.queryByText("/Standup")).toBeNull();
	await userEvent.clear(
		screen.getByRole("combobox", { name: "Search templates" }),
	);
	await userEvent.type(
		screen.getByRole("combobox", { name: "Search templates" }),
		"zzz",
	);
	expect(screen.getByText("No templates match.")).toBeTruthy();
});

it("hands the chosen template over and nothing else", async () => {
	const { onPick, onClose } = await setup();
	await userEvent.click(await screen.findByText("/Standup"));
	expect(onPick).toHaveBeenCalledTimes(1);
	expect(onPick.mock.calls[0]?.[0]).toMatchObject({ name: "Standup" });
	expect(onClose).not.toHaveBeenCalled();
});

it("chooses with the keyboard", async () => {
	const { onPick } = await setup();
	await screen.findByText("/Standup");
	const search = screen.getByRole("combobox", { name: "Search templates" });
	await userEvent.type(search, "bug");
	await userEvent.keyboard("{Enter}");
	expect(onPick.mock.calls[0]?.[0]).toMatchObject({ name: "Bug Report" });
});

it("opens the manager from the gear without choosing the template", async () => {
	const { onPick, onManage } = await setup();
	await screen.findByText("/Standup");
	await userEvent.click(screen.getByRole("button", { name: "Manage Standup" }));
	expect(onManage).toHaveBeenCalledTimes(1);
	expect(onPick).not.toHaveBeenCalled();
});

it("closes with Escape, and when you click away", async () => {
	const { onClose } = await setup();
	await screen.findByText("/Standup");
	await userEvent.keyboard("{Escape}");
	expect(onClose).toHaveBeenCalledTimes(1);
	await userEvent.click(document.body);
	expect(onClose).toHaveBeenCalledTimes(2);
});

it("says so when there are no templates", async () => {
	const host = new MemoryHost();
	await openVault(host);
	render(
		<TemplatePicker
			host={host}
			anchor={{ left: 0, top: 0, bottom: 0 }}
			onPick={() => {}}
			onManage={() => {}}
			onClose={() => {}}
		/>,
	);
	await waitFor(() =>
		expect(screen.getByText(/No templates yet/)).toBeTruthy(),
	);
});

it("shows a template that can't be read, but won't let it be chosen", async () => {
	const host = new MemoryHost();
	await openVault(host);
	await host.makeFolder(".vaultops/templates");
	await host.writeTextAtomic(".vaultops/templates/Broken.vnote", "junk");
	const onPick = vi.fn();
	render(
		<TemplatePicker
			host={host}
			anchor={{ left: 0, top: 0, bottom: 0 }}
			onPick={onPick}
			onManage={() => {}}
			onClose={() => {}}
		/>,
	);
	const row = await screen.findByText("/Broken");
	await userEvent.click(row);
	expect(onPick).not.toHaveBeenCalled();
});
