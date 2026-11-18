// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { CloseButton } from "./close-button";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

afterEach(cleanup);

const variants = {
	default: "bg-primary",
	secondary: "text-secondary-foreground",
	destructive: "bg-destructive",
	success: "bg-success",
	warning: "bg-warning",
	soft: "color-mix(in_srgb,var(--primary),var(--foreground)_25%)",
	tonal: "bg-primary-container",
	ghost: "bg-transparent",
	outline: "border-border",
	link: "hover:underline",
} as const;

const sizes = {
	sm: "h-[var(--control-height-sm)]",
	default: "h-[var(--control-height)]",
	lg: "h-[calc(var(--control-height)+8px)]",
	icon: "size-[var(--control-height)]",
	"icon-sm": "size-[var(--control-height-sm)]",
	"icon-lg": "size-[calc(var(--control-height)+8px)]",
} as const;

describe("Button", () => {
	it.each(Object.entries(variants))(
		"renders the %s variant",
		(variant, cls) => {
			render(<Button variant={variant as keyof typeof variants}>Go</Button>);
			const button = screen.getByRole("button", { name: "Go" });
			expect(button.getAttribute("data-slot")).toBe("button");
			expect(button.getAttribute("data-variant")).toBe(variant);
			expect(button.className).toContain(cls);
		},
	);

	it("keeps solid variants free of borders and shadows", () => {
		for (const variant of [
			"default",
			"secondary",
			"destructive",
			"success",
			"warning",
		] as const) {
			render(<Button variant={variant}>{variant}</Button>);
			const { className } = screen.getByRole("button", { name: variant });
			expect(className).toContain("border-transparent");
			expect(className).not.toMatch(/\bshadow/);
		}
	});

	it.each(Object.entries(sizes))("renders the %s size", (size, cls) => {
		render(
			<Button size={size as keyof typeof sizes} aria-label="b">
				x
			</Button>,
		);
		expect(screen.getByRole("button").className).toContain(cls);
	});

	it("makes a round icon button circular", () => {
		render(
			<Button size="icon" round aria-label="Add">
				+
			</Button>,
		);
		expect(screen.getByRole("button").className).toContain("rounded-full");
	});

	it("styles a pressed or on button as the selected look", () => {
		render(
			<>
				<Button variant="ghost" aria-pressed="true">
					Bold
				</Button>
				<Button variant="ghost" data-state="on">
					Italic
				</Button>
			</>,
		);
		const bold = screen.getByRole("button", { name: "Bold" });
		expect(bold.getAttribute("aria-pressed")).toBe("true");
		expect(bold.className).toContain("aria-pressed:text-[color:color-mix");
		expect(bold.className).toContain("aria-pressed:ring-primary/40");
		const italic = screen.getByRole("button", { name: "Italic" });
		expect(italic.className).toContain("data-[state=on]:text-[color:color-mix");
		expect(italic.className).toContain("data-[state=on]:ring-primary/40");
	});

	it("fades but keeps the fill when disabled", () => {
		render(<Button disabled>Off</Button>);
		const { className } = screen.getByRole("button", { name: "Off" });
		expect(className).toContain("disabled:opacity-50");
		expect(className).toContain("bg-primary");
	});
});

describe("CloseButton", () => {
	it("is an accessible ghost icon button named Close", async () => {
		const onClick = vi.fn();
		render(<CloseButton onClick={onClick} />);
		const button = screen.getByRole("button", { name: "Close" });
		expect(button.getAttribute("data-slot")).toBe("button");
		expect(button.getAttribute("data-variant")).toBe("ghost");
		expect(button.className).toContain("size-[var(--control-height-sm)]");
		await userEvent.click(button);
		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it("takes another label and size", () => {
		render(<CloseButton label="Dismiss" size="icon" />);
		const button = screen.getByRole("button", { name: "Dismiss" });
		expect(button.className).toContain("size-[var(--control-height)]");
	});

	it("is what a dialog uses for its X", () => {
		render(
			<Dialog open>
				<DialogContent>
					<DialogTitle>Hello</DialogTitle>
				</DialogContent>
			</Dialog>,
		);
		const close = screen.getByRole("button", { name: "Close" });
		expect(close.getAttribute("data-slot")).toBe("button");
		expect(close.getAttribute("data-variant")).toBe("ghost");
	});
});
