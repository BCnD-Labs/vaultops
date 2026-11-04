// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { StatusBar } from "./StatusBar";

afterEach(cleanup);

it("shows the vault and the counts, with singular wording for one", () => {
	const { container, rerender } = render(
		<StatusBar vault="Class" stats={{ words: 1234, characters: 5678 }} />,
	);
	const bar = container.querySelector(".status-bar") as HTMLElement;
	expect(bar.textContent).toContain("Class");
	expect(bar.textContent).toContain("1,234 words");
	expect(bar.textContent).toContain("5,678 characters");
	rerender(<StatusBar vault="Class" stats={{ words: 1, characters: 1 }} />);
	expect(bar.textContent).toContain("1 word");
	expect(bar.textContent).not.toContain("1 words");
	expect(bar.textContent).toContain("1 character");
});

it("shows only the vault when no note is open", () => {
	const { container } = render(<StatusBar vault="Class" stats={null} />);
	const bar = container.querySelector(".status-bar") as HTMLElement;
	expect(bar.textContent).toBe("Class");
});
