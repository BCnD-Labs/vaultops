import { describe, expect, it } from "vitest";
import { linkProblem } from "./link";

describe("linkProblem", () => {
	it.each([
		"",
		"   ",
		"https://example.com",
		"http://example.com/a/b?x=1#top",
		"HTTPS://Example.com",
		"https://sub.example.co.uk:8080/path",
		"http://localhost:3000",
		"http://192.168.0.1/",
		"  https://example.com  ",
		"mailto:sam@example.com",
		"mailto:sam@example.com?subject=Hi",
		"tel:+1 555".replace(" ", ""),
		"tel:555-123-4567",
	])("accepts %j", (value) => {
		expect(linkProblem(value)).toBeNull();
	});

	it.each([
		"example.com",
		"www.example.com",
		"htp://example.com",
		"javascript:alert(1)",
		"data:text/html,hi",
		"ftp://example.com",
		"https://",
		"https://nodot",
		"https://exa mple.com",
		"https://.example.com",
		"mailto:",
		"mailto:nobody",
		"mailto:a@b",
		"tel:",
		"tel:abc",
		"tel:12",
		"just some words",
	])("refuses %j with a reason", (value) => {
		expect(linkProblem(value)).toEqual(expect.any(String));
	});
});
