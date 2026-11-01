import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
	it("joins class names and skips empty ones", () => {
		expect(cn("a", false, undefined, "b")).toBe("a b");
	});

	it("lets the later Tailwind class win a clash", () => {
		expect(cn("px-2 px-4")).toBe("px-4");
		expect(cn("bg-primary", "bg-secondary")).toBe("bg-secondary");
	});
});
