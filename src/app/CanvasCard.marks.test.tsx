// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { CanvasCard } from "./CanvasCard";

afterEach(cleanup);

it("shows underline, highlight, strikethrough, subscript and superscript on a card", () => {
	const text = (value: string, mark: string) => ({
		type: "text",
		text: value,
		marks: [{ type: mark }],
	});
	const { container } = render(
		<CanvasCard
			root={{
				id: "card",
				type: "paragraph",
				parent: null,
				content: [
					text("under", "underline"),
					text("light", "highlight"),
					text("gone", "strike"),
					text("low", "subscript"),
					text("high", "superscript"),
				],
			}}
			blocks={[]}
		/>,
	);
	expect(container.querySelector("u")?.textContent).toBe("under");
	expect(container.querySelector("mark")?.textContent).toBe("light");
	expect(container.querySelector("s")?.textContent).toBe("gone");
	expect(container.querySelector("sub")?.textContent).toBe("low");
	expect(container.querySelector("sup")?.textContent).toBe("high");
});

it("shows a note link by the name it was saved with", () => {
	const { container } = render(
		<CanvasCard
			root={{
				id: "card",
				type: "paragraph",
				parent: null,
				content: [
					{ type: "text", text: "call " },
					{
						type: "noteLink",
						attrs: { kind: "resource", target: "r1", label: "Sam Rivera" },
					},
				],
			}}
			blocks={[]}
		/>,
	);
	expect(container.textContent).toBe("call Sam Rivera");
	expect(container.querySelector(".note-link-chip")).toBeTruthy();
});
