// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import {
	FolderPickerDialog,
	matchFolders,
	VAULT_ROOT,
} from "./FolderPickerDialog";

afterEach(() => cleanup());

it("lists the vault root first, then folders in order, and filters by what is typed", () => {
	const folders = ["School/Math", "Class", "School"];
	expect(matchFolders(folders, "")).toEqual([
		"",
		"Class",
		"School",
		"School/Math",
	]);
	expect(matchFolders(folders, "math")).toEqual(["School/Math"]);
	expect(matchFolders(folders, "vault")).toEqual([""]);
	expect(matchFolders(folders, "zzz")).toEqual([]);
});

it("picks a folder, and will not pick the one the note is already in", async () => {
	const user = userEvent.setup();
	const onPick = vi.fn();
	render(
		<FolderPickerDialog
			open
			onOpenChange={() => {}}
			folders={["Class", "School"]}
			current="Class"
			onPick={onPick}
		/>,
	);
	expect(screen.getByText("here now")).toBeTruthy();
	await user.click(screen.getByText("Class"));
	expect(onPick).not.toHaveBeenCalled();
	await user.click(screen.getByText("School"));
	expect(onPick).toHaveBeenCalledWith("School");
	await user.click(screen.getByText(VAULT_ROOT));
	expect(onPick).toHaveBeenLastCalledWith("");
});

it("says so when no folder matches", async () => {
	const user = userEvent.setup();
	render(
		<FolderPickerDialog
			open
			onOpenChange={() => {}}
			folders={["Class"]}
			current=""
			onPick={() => {}}
		/>,
	);
	await user.type(screen.getByRole("combobox"), "zzz");
	expect(screen.getByText("No folders found.")).toBeTruthy();
});
