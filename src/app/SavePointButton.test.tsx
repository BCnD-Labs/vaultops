// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MemoryHost } from "../host/memory-host";
import { SavePointButton } from "./SavePointButton";

afterEach(cleanup);

async function vault() {
	const host = new MemoryHost();
	await host.writeTextAtomic("Trip.vnote", "one");
	await host.vcs.enable("Sam");
	return host;
}

it("is hidden until history is on", async () => {
	const host = new MemoryHost();
	const { container } = render(
		<SavePointButton host={host} flush={async () => true} />,
	);
	await new Promise((r) => setTimeout(r, 0));
	expect(container.textContent).toBe("");
});

it("counts changes and makes a save point with the prefilled description", async () => {
	const user = userEvent.setup();
	const host = await vault();
	await host.writeTextAtomic("Trip.vnote", "two");
	const flush = vi.fn(async () => true);
	render(<SavePointButton host={host} flush={flush} />);
	const button = await screen.findByRole("button", { name: /Save point/ });
	expect(button.textContent).toContain("1");
	await user.click(button);
	const box = await screen.findByRole("textbox", {
		name: "Save point description",
	});
	expect(box.getAttribute("placeholder")).toBe("Edited Trip");
	await user.click(screen.getByRole("button", { name: "Make save point" }));
	expect(flush).toHaveBeenCalled();
	expect(host.historyLog.at(-1)).toBe("Edited Trip");
	expect((await host.vcs.status()).changes).toEqual([]);
});

it("uses a typed description, and refuses when a note couldn't be saved", async () => {
	const user = userEvent.setup();
	const host = await vault();
	await host.writeTextAtomic("Trip.vnote", "two");
	let ok = false;
	render(<SavePointButton host={host} flush={async () => ok} />);
	await user.click(await screen.findByRole("button", { name: /Save point/ }));
	await user.type(
		await screen.findByRole("textbox", { name: "Save point description" }),
		"Packed the bags",
	);
	await user.click(screen.getByRole("button", { name: "Make save point" }));
	expect((await screen.findByRole("alert")).textContent).toContain(
		"couldn't be saved to disk",
	);
	expect(host.historyLog).toEqual(["History turned on"]);
	ok = true;
	await user.click(screen.getByRole("button", { name: "Make save point" }));
	expect(host.historyLog.at(-1)).toBe("Packed the bags");
});
