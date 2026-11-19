import { describe, expect, it } from "vitest";
import {
	evaluate,
	MAX_VALUE,
	parseExpression,
	parseFunctions,
} from "./expression";

function at(source: string, x = 0): number {
	const result = parseExpression(source);
	if (!result.ok) throw new Error(result.message);
	return evaluate(result.expr, x);
}
function message(source: string): string {
	const result = parseExpression(source);
	if (result.ok) throw new Error(`"${source}" should not parse`);
	return result.message;
}

describe("plot expressions", () => {
	it.each([
		["1+2*3", 0, 7],
		["(1+2)*3", 0, 9],
		["10-4-3", 0, 3],
		["8/4/2", 0, 1],
		["2^3^2", 0, 512],
		["-2^2", 0, -4],
		["2^-1", 0, 0.5],
		["--3", 0, 3],
		["y = x^2", 3, 9],
		["1e3", 0, 1000],
		["2.5E-1", 0, 0.25],
		["2e", 0, 2 * Math.E],
		["f(x) = x+1", 2, 3],
		["Y=X", 4, 4],
		["2x", 5, 10],
		["2x^2", 3, 18],
		["3(x+1)", 1, 6],
		["x(x+1)", 2, 6],
		["2pi", 0, 2 * Math.PI],
		["e", 0, Math.E],
		["sin(0)", 0, 0],
		["cos(pi)", 0, -1],
		["sqrt(x)+abs(-3)", 16, 7],
		["ln(e)", 0, 1],
		["log(1000)", 0, 3],
		["exp(0)", 0, 1],
		["floor(2.7)+ceil(2.2)+round(2.5)", 0, 8],
		["min(x, 2)", 5, 2],
		["max(x, 2)", 5, 5],
		["2 sin(x)", Math.PI / 2, 2],
		["0^0", 0, 1],
		[".5+1.", 0, 1.5],
	])("%s at x=%s is %s", (source, x, expected) => {
		expect(at(source, x)).toBeCloseTo(expected, 9);
	});

	it("has no value where the formula has none", () => {
		expect(at("1/x", 0)).toBeNaN();
		expect(at("sqrt(x)", -1)).toBeNaN();
		expect(at("ln(x)", 0)).toBeNaN();
		expect(at("x^x", 1000)).toBeNaN();
		expect(at("9^99")).toBeNaN();
		expect(MAX_VALUE).toBe(1e12);
	});

	it.each([
		["foo", "I don't know 'foo'"],
		["constructor", "I don't know 'constructor'"],
		["__proto__", "I don't know '_'"],
		["toString(x)", "I don't know 'tostring'"],
		["x^y", "I don't know 'y'"],
		["sin", "'sin' needs brackets, like sin(x)"],
		["sin x", "'sin' needs brackets, like sin(x)"],
		["min(1)", "'min' takes two values"],
		["sin(1,2)", "'sin' takes one value"],
		["(1+2", "There's a ( without a matching )"],
		["1+2)", "There's a ) without a matching ("],
		["1+", "The formula ends too soon"],
		["*2", "I didn't expect '*' there"],
		["2 $ 3", "I don't know '$'"],
		["", "Type a formula, like y = x^2"],
		["y =", "Type a formula, like y = x^2"],
	])("explains %j", (source, expected) => {
		expect(message(source)).toBe(expected);
	});

	it("refuses hostile or oversized input without running anything", () => {
		expect(message("x".repeat(201))).toMatch(/200 characters/);
		expect(message("x^".repeat(60))).toMatch(/nested too deeply/);
		expect(message(`${"(".repeat(50)}x${")".repeat(50)}`)).toMatch(
			/nested too deeply/,
		);
		expect(message(`${"x+".repeat(60)}x`)).toMatch(/nested too deeply/);
		expect(message("sin(".repeat(45))).toMatch(/nested too deeply/);
		expect(message("process.exit()")).toMatch(/I can't read/);
		expect(message("alert(1)")).toMatch(/I don't know 'alert'/);
		expect(message("globalThis")).toMatch(/I don't know/);
		expect(at("x^x^x^x", 3)).toBeNaN();
	});
});

describe("plot formulas in a block", () => {
	it("splits on ; and new lines and ignores blanks", () => {
		const list = parseFunctions("y = x^2;sin(x)\n\n  cos(x) ;");
		expect(list.map((f) => f.source)).toEqual(["y = x^2", "sin(x)", "cos(x)"]);
		expect(list.every((f) => f.expr && !f.error)).toBe(true);
	});

	it("keeps the formulas that work next to one that doesn't", () => {
		const list = parseFunctions("x^2; foo(x)");
		expect(list[0]?.error).toBeNull();
		expect(list[1]).toMatchObject({ expr: null, error: "I don't know 'foo'" });
	});

	it("draws at most four", () => {
		const list = parseFunctions("x;x;x;x;x");
		expect(list.filter((f) => f.expr)).toHaveLength(4);
		expect(list[4]?.error).toMatch(/Only 4/);
	});

	it("has nothing for blank text", () => {
		expect(parseFunctions("  \n ; ")).toEqual([]);
	});
});
