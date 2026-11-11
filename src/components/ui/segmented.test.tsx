// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScaleInput, SegmentedInput } from "./segmented";

afterEach(cleanup);

const OPTS = [
	{ value: "Easy", label: "Easy" },
	{ value: "Moderate", label: "Moderate" },
	{ value: "Hard", label: "Hard" },
];

function Harness({ clearable = true }: { clearable?: boolean }) {
	const [v, setV] = useState<string | null>(null);
	return (
		<>
			<SegmentedInput
				label="Difficulty"
				options={OPTS}
				value={v}
				onChange={setV}
				clearable={clearable}
			/>
			<output data-testid="v">{v ?? "none"}</output>
		</>
	);
}

describe("SegmentedInput", () => {
	it("picks on click and clears by clicking the chosen one again", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(screen.getByRole("radio", { name: "Hard" }));
		expect(screen.getByTestId("v").textContent).toBe("Hard");
		expect(
			screen.getByRole("radio", { name: "Hard" }).getAttribute("aria-checked"),
		).toBe("true");
		await user.click(screen.getByRole("radio", { name: "Hard" }));
		expect(screen.getByTestId("v").textContent).toBe("none");
	});

	it("does not clear when clearable is off", async () => {
		const user = userEvent.setup();
		render(<Harness clearable={false} />);
		await user.click(screen.getByRole("radio", { name: "Easy" }));
		await user.click(screen.getByRole("radio", { name: "Easy" }));
		expect(screen.getByTestId("v").textContent).toBe("Easy");
	});

	it("moves focus with arrow keys and picks with Space", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		await user.tab();
		expect(document.activeElement).toBe(
			screen.getByRole("radio", { name: "Easy" }),
		);
		await user.keyboard("{ArrowRight}");
		expect(document.activeElement).toBe(
			screen.getByRole("radio", { name: "Moderate" }),
		);
		await user.keyboard(" ");
		expect(screen.getByTestId("v").textContent).toBe("Moderate");
	});

	it("clears with Backspace", async () => {
		const user = userEvent.setup();
		render(<Harness />);
		await user.click(screen.getByRole("radio", { name: "Easy" }));
		await user.keyboard("{Backspace}");
		expect(screen.getByTestId("v").textContent).toBe("none");
	});

	it("ignores input when disabled", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<SegmentedInput
				label="Difficulty"
				options={OPTS}
				value={null}
				onChange={onChange}
				disabled
			/>,
		);
		await user.click(screen.getByRole("radio", { name: "Easy" }));
		expect(onChange).not.toHaveBeenCalled();
	});
});

describe("ScaleInput", () => {
	it("offers 1 to 5 and reports numbers", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ScaleInput
				label="Energy"
				value={null}
				onChange={onChange}
				lowLabel="Low"
				highLabel="High"
			/>,
		);
		expect(screen.getAllByRole("radio")).toHaveLength(5);
		await user.click(screen.getByRole("radio", { name: "5, High" }));
		expect(onChange).toHaveBeenCalledWith(5);
	});

	it("clears to null", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ScaleInput label="Mood" value={3} onChange={onChange} />);
		await user.click(screen.getByRole("radio", { name: "3" }));
		expect(onChange).toHaveBeenCalledWith(null);
	});
});
