// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPicker } from "./color-picker";
import { hexToHsv, hsvToHex, parseHex } from "./color-utils";

afterEach(() => {
	cleanup();
	localStorage.clear();
});

const PALETTE = [
	{ value: "red", label: "Colour red", css: "#e5484d" },
	{ value: "blue", label: "Colour blue", css: "#3b82f6" },
];

describe("colour maths", () => {
	it("validates and normalises hex", () => {
		expect(parseHex("#FFF")).toBe("#ffffff");
		expect(parseHex("3B82F6")).toBe("#3b82f6");
		expect(parseHex("#12345")).toBeNull();
		expect(parseHex("#12345g")).toBeNull();
		expect(parseHex("")).toBeNull();
	});
	it("round-trips hex through hsv", () => {
		for (const hex of ["#ff0000", "#3b82f6", "#000000", "#ffffff", "#80c040"]) {
			expect(hsvToHex(hexToHsv(hex))).toBe(hex);
		}
	});
});

describe("ColorPicker", () => {
	it("flags an invalid hex, does not apply it, and applies a valid one on Enter", async () => {
		const onChange = vi.fn();
		render(
			createElement(ColorPicker, {
				value: undefined,
				onChange,
				palette: PALETTE,
			}),
		);
		const input = screen.getByLabelText("Hex colour");
		await userEvent.type(input, "#12zz");
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert")).toBeTruthy();
		await userEvent.keyboard("{Enter}");
		expect(onChange).not.toHaveBeenCalled();
		await userEvent.clear(input);
		await userEvent.type(input, "ABC{Enter}");
		expect(onChange).toHaveBeenLastCalledWith("#aabbcc");
		expect(
			JSON.parse(localStorage.getItem("vaultops.recentColors") ?? "[]"),
		).toEqual(["#aabbcc"]);
	});

	it("moves the area and hue with the arrow keys", () => {
		const onChange = vi.fn();
		render(
			createElement(ColorPicker, {
				value: "#ff0000",
				onChange,
				palette: PALETTE,
			}),
		);
		const area = screen.getByRole("slider", {
			name: "Saturation and brightness",
		});
		fireEvent.keyDown(area, { key: "ArrowLeft" });
		expect(onChange).toHaveBeenLastCalledWith("#ff0505");
		fireEvent.keyDown(area, { key: "ArrowDown", shiftKey: true });
		expect(onChange.mock.calls.at(-1)?.[0]).not.toBe("#ff0505");
		const hue = screen.getByRole("slider", { name: "Hue" });
		fireEvent.keyDown(hue, { key: "ArrowRight" });
		expect(hue.getAttribute("aria-valuenow")).toBe("3");
		fireEvent.keyDown(hue, { key: "End" });
		expect(hue.getAttribute("aria-valuenow")).toBe("360");
	});

	it("picks theme swatches and Default, and shows recent colours", async () => {
		const onChange = vi.fn();
		localStorage.setItem(
			"vaultops.recentColors",
			JSON.stringify(["#112233", "bad"]),
		);
		render(
			createElement(ColorPicker, { value: "red", onChange, palette: PALETTE }),
		);
		expect(
			screen.getByLabelText("Colour red").getAttribute("aria-pressed"),
		).toBe("true");
		await userEvent.click(screen.getByLabelText("Colour blue"));
		expect(onChange).toHaveBeenLastCalledWith("blue");
		await userEvent.click(screen.getByLabelText("Recent #112233"));
		expect(onChange).toHaveBeenLastCalledWith("#112233");
		await userEvent.click(screen.getByRole("button", { name: "Default" }));
		expect(onChange).toHaveBeenLastCalledWith(undefined);
	});
});
