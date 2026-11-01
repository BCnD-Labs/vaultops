import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Collapsible, CollapsibleContent } from "./collapsible";
import * as contextMenu from "./context-menu";
import * as dropdownMenu from "./dropdown-menu";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "./resizable";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import * as tooltip from "./tooltip";

describe("shared UI components", () => {
	it("renders tabs with the active panel", () => {
		const html = renderToStaticMarkup(
			createElement(
				Tabs,
				{ defaultValue: "a" },
				createElement(
					TabsList,
					null,
					createElement(TabsTrigger, { value: "a" }, "Properties"),
					createElement(TabsTrigger, { value: "b" }, "Changes"),
				),
				createElement(TabsContent, { value: "a" }, "first"),
				createElement(TabsContent, { value: "b" }, "second"),
			),
		);
		expect(html).toContain("Properties");
		expect(html).toContain("first");
		expect(html).not.toContain("second");
	});

	it("renders a separator, a scroll area and a collapsible", () => {
		expect(
			renderToStaticMarkup(
				createElement(Separator, { orientation: "vertical" }),
			),
		).toContain('data-orientation="vertical"');
		expect(
			renderToStaticMarkup(createElement(ScrollArea, null, "inside")),
		).toContain("inside");
		expect(
			renderToStaticMarkup(
				createElement(
					Collapsible,
					{ open: true },
					createElement(CollapsibleContent, null, "body"),
				),
			),
		).toContain("body");
	});

	it("renders resizable panels in both orientations", () => {
		for (const orientation of ["horizontal", "vertical"] as const) {
			const html = renderToStaticMarkup(
				createElement(
					ResizablePanelGroup,
					{ orientation },
					createElement(ResizablePanel, { id: "a" }, "one"),
					createElement(ResizableHandle, null),
					createElement(ResizablePanel, { id: "b" }, "two"),
				),
			);
			expect(html).toContain("one");
			expect(html).toContain("two");
		}
	});

	it("exports the menu and tooltip parts", () => {
		for (const part of [
			dropdownMenu.DropdownMenu,
			dropdownMenu.DropdownMenuTrigger,
			dropdownMenu.DropdownMenuContent,
			dropdownMenu.DropdownMenuItem,
			contextMenu.ContextMenu,
			contextMenu.ContextMenuTrigger,
			contextMenu.ContextMenuContent,
			contextMenu.ContextMenuItem,
			tooltip.TooltipProvider,
			tooltip.Tooltip,
			tooltip.TooltipTrigger,
			tooltip.TooltipContent,
		]) {
			expect(typeof part).toBe("function");
		}
	});
});
