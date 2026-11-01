// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "./collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

afterEach(cleanup);

// Interaction tests: they click and type, which static rendering cannot.

describe("shared UI components (interaction)", () => {
	it("switches tabs when a tab is clicked", async () => {
		const user = userEvent.setup();
		render(
			<Tabs defaultValue="props">
				<TabsList>
					<TabsTrigger value="props">Properties</TabsTrigger>
					<TabsTrigger value="changes">Changes</TabsTrigger>
				</TabsList>
				<TabsContent value="props">property panel</TabsContent>
				<TabsContent value="changes">change list</TabsContent>
			</Tabs>,
		);
		expect(screen.queryByText("change list")).toBeNull();
		await user.click(screen.getByRole("tab", { name: "Changes" }));
		expect(screen.getByText("change list")).toBeTruthy();
		expect(screen.queryByText("property panel")).toBeNull();
	});

	it("opens and closes a collapsible section", async () => {
		const user = userEvent.setup();
		render(
			<Collapsible>
				<CollapsibleTrigger>Tags</CollapsibleTrigger>
				<CollapsibleContent>tag list</CollapsibleContent>
			</Collapsible>,
		);
		expect(screen.queryByText("tag list")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Tags" }));
		expect(screen.getByText("tag list")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "Tags" }));
		expect(screen.queryByText("tag list")).toBeNull();
	});
});
