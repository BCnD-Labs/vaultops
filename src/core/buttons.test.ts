import { expect, it } from "vitest";
import { resolveButtonTarget } from "./buttons";

it("resolves a target by exact key and leaves stale or empty targets unresolved", () => {
	const options = [{ id: "Folder/Meeting" }, { id: "Meeting" }];
	const resolve = (target: string) =>
		resolveButtonTarget(target, options, (item) => item.id);
	expect(resolve("Folder/Meeting")).toBe(options[0]);
	expect(resolve("Meeting")).toBe(options[1]);
	expect(resolve("Old/Meeting")).toBeUndefined();
	expect(resolve("")).toBeUndefined();
});
