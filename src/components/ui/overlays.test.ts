import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import * as alertDialog from "./alert-dialog";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "./command";
import * as dialog from "./dialog";
import * as popover from "./popover";
import { Toaster } from "./sonner";

describe("overlay components", () => {
	it("renders a command palette with a search box and items", () => {
		const html = renderToStaticMarkup(
			createElement(
				Command,
				null,
				createElement(CommandInput, { placeholder: "Find a note" }),
				createElement(
					CommandList,
					null,
					createElement(CommandEmpty, null, "No notes match."),
					createElement(
						CommandGroup,
						{ heading: "Notes" },
						createElement(CommandItem, null, "Roadmap"),
						createElement(CommandItem, null, "Lecture 1"),
					),
				),
			),
		);
		expect(html).toContain('placeholder="Find a note"');
		expect(html).toContain("Roadmap");
		expect(html).toContain("Lecture 1");
	});

	it("keeps closed overlays out of the page", () => {
		const html = renderToStaticMarkup(
			createElement(
				dialog.Dialog,
				{ open: false },
				createElement(dialog.DialogTrigger, null, "Open"),
				createElement(dialog.DialogContent, null, "hidden body"),
			),
		);
		expect(html).toContain("Open");
		expect(html).not.toContain("hidden body");
	});

	it("exports every part", () => {
		for (const part of [
			dialog.DialogContent,
			dialog.DialogHeader,
			dialog.DialogFooter,
			dialog.DialogTitle,
			dialog.DialogDescription,
			alertDialog.AlertDialog,
			alertDialog.AlertDialogContent,
			alertDialog.AlertDialogAction,
			alertDialog.AlertDialogCancel,
			popover.Popover,
			popover.PopoverTrigger,
			popover.PopoverContent,
			Toaster,
		]) {
			expect(typeof part).toBe("function");
		}
	});
});
