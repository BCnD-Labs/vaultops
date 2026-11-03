// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Props } from "../core/notes/properties";
import { AppShell } from "./AppShell";
import { NoteChips, NoteDetails } from "./NoteMetadata";
import { NoteTools } from "./NoteTools";

const props: Props = {
	tags: { type: "list", value: ["idea", "work"] },
	Summary: { type: "text", value: "Hello" },
	Pages: { type: "number", value: 0 },
	Done: { type: "checkbox", value: false },
	Due: { type: "date", value: "2026-11-05" },
};
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	localStorage.clear();
});

it("shows tags and the first three known properties and removes only the chosen tag", async () => {
	const onChange = vi.fn();
	render(<NoteChips props={props} editable onChange={onChange} />);
	expect(screen.getByText("Hello")).toBeTruthy();
	expect(screen.getByText("0")).toBeTruthy();
	expect(screen.getByText("No")).toBeTruthy();
	expect(
		screen.queryByRole("button", { name: "Open property Due" }),
	).toBeNull();
	await userEvent.click(
		screen.getByRole("button", { name: "Remove idea from tags" }),
	);
	expect(onChange).toHaveBeenCalledWith({
		...props,
		tags: { type: "list", value: ["work"] },
	});
});

it.each([{}, null])(
	"keeps More available without readable metadata: %s",
	(props) => {
		render(<NoteChips props={props} editable onChange={vi.fn()} />);
		expect(
			screen.getAllByRole("button").map((button) => button.textContent),
		).toEqual(["+ More"]);
	},
);

it("shows read-only chips without removal buttons", () => {
	render(<NoteChips props={props} editable={false} onChange={vi.fn()} />);
	expect(screen.getByText("idea")).toBeTruthy();
	expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
});

it("opens Properties from Changes, expands the sidebar, and focuses the chosen field on repeated clicks", async () => {
	const user = userEvent.setup();
	render(
		<TooltipProvider>
			<AppShell
				vault="Vault"
				path="note.jsonl"
				title="Note"
				sidebar={null}
				tools={
					<NoteTools
						hasNote
						props={props}
						editable
						onChange={() => {}}
						onOpenTag={() => {}}
					/>
				}
			>
				<NoteChips props={props} editable onChange={() => {}} />
			</AppShell>
		</TooltipProvider>,
	);
	await user.click(screen.getByRole("tab", { name: "Changes" }));
	await user.click(
		screen.getByRole("button", { name: "Toggle right sidebar" }),
	);
	for (let i = 0; i < 2; i++) {
		await user.click(
			screen.getByRole("button", { name: "Open property Summary" }),
		);
		await waitFor(() =>
			expect(document.activeElement).toBe(
				screen.getByRole("textbox", { name: "Summary" }),
			),
		);
		expect(
			screen
				.getByRole("tab", { name: "Properties" })
				.getAttribute("aria-selected"),
		).toBe("true");
	}
	await user.click(screen.getByRole("button", { name: "+ More" }));
	await waitFor(() =>
		expect(document.activeElement?.getAttribute("aria-label")).toBe(
			"Note properties",
		),
	);
});

it.each([false, true])(
	"remembers Details and works with storage failing=%s",
	async (failing) => {
		if (failing)
			vi.stubGlobal("localStorage", {
				getItem() {
					throw Error("denied");
				},
				setItem() {
					throw Error("denied");
				},
			});
		const details = (
			<NoteDetails path="folder/note.jsonl" count={3} status="Saved" />
		);
		const first = render(details);
		const trigger = screen.getByRole("button", { name: "Details" });
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		await userEvent.click(trigger);
		expect(screen.getByText("folder/note.jsonl")).toBeTruthy();
		expect(screen.getByText("3")).toBeTruthy();
		expect(screen.getByText("Saved")).toBeTruthy();
		first.unmount();
		render(details);
		expect(
			screen
				.getByRole("button", { name: "Details" })
				.getAttribute("aria-expanded"),
		).toBe(String(!failing));
	},
);
