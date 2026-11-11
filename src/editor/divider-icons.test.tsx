// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DIVIDER_ICONS } from "./divider-icons";

it("renders every divider icon without React warnings (each part needs a key)", () => {
	const error = vi.spyOn(console, "error").mockImplementation(() => {});
	for (const Icon of Object.values(DIVIDER_ICONS)) {
		const { container, unmount } = render(<Icon />);
		expect(container.querySelector("svg")).toBeTruthy();
		unmount();
	}
	expect(error).not.toHaveBeenCalled();
	error.mockRestore();
});

it("draws the dashed, dotted and thick icons as separate marks", () => {
	const marks = (Icon: (typeof DIVIDER_ICONS)[keyof typeof DIVIDER_ICONS]) =>
		render(<Icon />).container.querySelectorAll("svg path").length;
	expect(marks(DIVIDER_ICONS.solid)).toBe(1);
	expect(marks(DIVIDER_ICONS.dashed)).toBe(3);
	expect(marks(DIVIDER_ICONS.dotted)).toBe(4);
	expect(marks(DIVIDER_ICONS.thick)).toBe(1);
});
