import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "./breadcrumb";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { Kbd } from "./kbd";
import { Label } from "./label";
import { Select, SelectTrigger, SelectValue } from "./select";
import { Skeleton } from "./skeleton";
import { Switch } from "./switch";
import { Textarea } from "./textarea";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
	renderToStaticMarkup(el);

describe("form and display components", () => {
	it("renders the plain controls", () => {
		expect(html(createElement(Input, { placeholder: "Name" }))).toContain(
			'placeholder="Name"',
		);
		expect(html(createElement(Textarea, { defaultValue: "body" }))).toContain(
			"body",
		);
		expect(html(createElement(Label, null, "Title"))).toContain("Title");
		expect(html(createElement(Kbd, null, "⌘K"))).toContain("⌘K");
		expect(html(createElement(Badge, null, "tag"))).toContain("tag");
		expect(html(createElement(Skeleton, { className: "h-4" }))).toContain(
			"h-4",
		);
	});

	it("renders checkbox, switch and select in their states", () => {
		expect(html(createElement(Checkbox, { defaultChecked: true }))).toContain(
			'data-state="checked"',
		);
		expect(html(createElement(Switch))).toContain('data-state="unchecked"');
		expect(
			html(
				createElement(
					Select,
					{ defaultValue: "a" },
					createElement(
						SelectTrigger,
						null,
						createElement(SelectValue, { placeholder: "Pick" }),
					),
				),
			),
		).toContain("combobox");
	});

	it("renders a toggle group and a breadcrumb", () => {
		expect(
			html(
				createElement(
					ToggleGroup,
					{ type: "single", defaultValue: "side" },
					createElement(ToggleGroupItem, { value: "side" }, "Side by side"),
					createElement(ToggleGroupItem, { value: "stack" }, "Stacked"),
				),
			),
		).toContain("Stacked");
		expect(
			html(
				createElement(
					Breadcrumb,
					null,
					createElement(
						BreadcrumbList,
						null,
						createElement(
							BreadcrumbItem,
							null,
							createElement(BreadcrumbPage, null, "Roadmap"),
						),
					),
				),
			),
		).toContain('aria-current="page"');
	});
});
