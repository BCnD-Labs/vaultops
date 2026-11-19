/**
 * A small, safe formula reader for the plot block. It reads text such as
 * `y = 2x^2 - sin(x)` into a tree and evaluates the tree for a given x.
 * Nothing here runs the text as code: names come from fixed tables, so words
 * like `constructor` or `__proto__` are simply unknown.
 */

export type Expr =
	| { kind: "num"; value: number }
	| { kind: "x" }
	| { kind: "neg"; arg: Expr }
	| { kind: "bin"; op: "+" | "-" | "*" | "/" | "^"; left: Expr; right: Expr }
	| { kind: "call"; name: string; args: Expr[] };

export type ParseResult =
	| { ok: true; expr: Expr }
	| { ok: false; message: string };

export const MAX_LENGTH = 200;
export const MAX_DEPTH = 40;
export const MAX_FUNCTIONS = 4;
/** Results beyond this are treated as "off the graph". */
export const MAX_VALUE = 1e12;

const CONSTANTS = new Map([
	["pi", Math.PI],
	["e", Math.E],
]);

const FUNCTIONS = new Map<
	string,
	{ arity: number; run: (...a: number[]) => number }
>([
	["sin", { arity: 1, run: Math.sin }],
	["cos", { arity: 1, run: Math.cos }],
	["tan", { arity: 1, run: Math.tan }],
	["asin", { arity: 1, run: Math.asin }],
	["acos", { arity: 1, run: Math.acos }],
	["atan", { arity: 1, run: Math.atan }],
	["sqrt", { arity: 1, run: Math.sqrt }],
	["abs", { arity: 1, run: Math.abs }],
	["ln", { arity: 1, run: Math.log }],
	["log", { arity: 1, run: Math.log10 }],
	["exp", { arity: 1, run: Math.exp }],
	["floor", { arity: 1, run: Math.floor }],
	["ceil", { arity: 1, run: Math.ceil }],
	["round", { arity: 1, run: Math.round }],
	["min", { arity: 2, run: Math.min }],
	["max", { arity: 2, run: Math.max }],
]);

type Token =
	| { type: "num"; value: number }
	| { type: "name"; value: string }
	| { type: "op"; value: string };

class ParseError extends Error {}

function tokenize(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const ch = source.charAt(i);
		if (/\s/.test(ch)) {
			i++;
		} else if (/[0-9.]/.test(ch)) {
			// "1e3" is 1000 (scientific notation); "2e" alone still means 2 times e.
			const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(source.slice(i));
			if (!match) throw new ParseError(`I can't read '${ch}' as a number`);
			tokens.push({ type: "num", value: Number(match[0]) });
			i += match[0].length;
		} else if (/[a-zA-Z]/.test(ch)) {
			const match = /^[a-zA-Z]+/.exec(source.slice(i));
			const word = (match?.[0] ?? ch).toLowerCase();
			tokens.push({ type: "name", value: word });
			i += word.length;
		} else if ("+-*/^(),".includes(ch)) {
			tokens.push({ type: "op", value: ch });
			i++;
		} else if (ch === "×" || ch === "·") {
			tokens.push({ type: "op", value: "*" });
			i++;
		} else if (ch === "−") {
			tokens.push({ type: "op", value: "-" });
			i++;
		} else {
			throw new ParseError(`I don't know '${ch}'`);
		}
	}
	return tokens;
}

function depthOf(expr: Expr): number {
	switch (expr.kind) {
		case "num":
		case "x":
			return 1;
		case "neg":
			return 1 + depthOf(expr.arg);
		case "bin":
			return 1 + Math.max(depthOf(expr.left), depthOf(expr.right));
		case "call":
			return 1 + Math.max(0, ...expr.args.map(depthOf));
	}
}

class Parser {
	private pos = 0;
	private nest = 0;
	constructor(private readonly tokens: Token[]) {}

	parse(): Expr {
		const expr = this.sum();
		const next = this.tokens[this.pos];
		if (next) {
			throw new ParseError(
				next.value === ")"
					? "There's a ) without a matching ("
					: `I didn't expect '${next.value}' there`,
			);
		}
		return expr;
	}

	private peekOp(...ops: string[]): string | null {
		const t = this.tokens[this.pos];
		return t?.type === "op" && ops.includes(t.value) ? t.value : null;
	}

	private enter() {
		if (++this.nest > MAX_DEPTH)
			throw new ParseError("That formula is nested too deeply");
	}

	private sum(): Expr {
		let left = this.product();
		for (let op = this.peekOp("+", "-"); op; op = this.peekOp("+", "-")) {
			this.pos++;
			left = { kind: "bin", op: op as "+" | "-", left, right: this.product() };
		}
		return left;
	}

	private startsOperand(): boolean {
		const t = this.tokens[this.pos];
		return t?.type === "num" || t?.type === "name" || this.peekOp("(") !== null;
	}

	private product(): Expr {
		let left = this.unary();
		for (;;) {
			const op = this.peekOp("*", "/");
			if (op) {
				this.pos++;
				left = { kind: "bin", op: op as "*" | "/", left, right: this.unary() };
			} else if (this.startsOperand()) {
				// `2x`, `3(x+1)`, `x sin(x)`: written next to each other means times.
				left = { kind: "bin", op: "*", left, right: this.power() };
			} else return left;
		}
	}

	private unary(): Expr {
		const op = this.peekOp("-", "+");
		if (!op) return this.power();
		this.pos++;
		this.enter();
		const arg = this.unary();
		this.nest--;
		return op === "-" ? { kind: "neg", arg } : arg;
	}

	private power(): Expr {
		const base = this.primary();
		if (!this.peekOp("^")) return base;
		this.pos++;
		this.enter();
		const exponent = this.unary();
		this.nest--;
		return { kind: "bin", op: "^", left: base, right: exponent };
	}

	private primary(): Expr {
		const t = this.tokens[this.pos];
		if (!t) throw new ParseError("The formula ends too soon");
		this.pos++;
		if (t.type === "num") return { kind: "num", value: t.value };
		if (t.type === "name") return this.name(t.value);
		if (t.value === "(") {
			this.enter();
			const inner = this.sum();
			this.nest--;
			if (!this.peekOp(")"))
				throw new ParseError("There's a ( without a matching )");
			this.pos++;
			return inner;
		}
		throw new ParseError(`I didn't expect '${t.value}' there`);
	}

	private name(word: string): Expr {
		if (word === "x") return { kind: "x" };
		const constant = CONSTANTS.get(word);
		if (constant !== undefined) return { kind: "num", value: constant };
		const fn = FUNCTIONS.get(word);
		if (!fn) throw new ParseError(`I don't know '${word}'`);
		if (!this.peekOp("("))
			throw new ParseError(`'${word}' needs brackets, like ${word}(x)`);
		this.pos++;
		const args: Expr[] = [];
		this.enter();
		do {
			args.push(this.sum());
			if (this.peekOp(",")) this.pos++;
			else break;
		} while (args.length <= fn.arity);
		this.nest--;
		if (!this.peekOp(")"))
			throw new ParseError(`There's a ( without a matching )`);
		this.pos++;
		if (args.length !== fn.arity)
			throw new ParseError(
				`'${word}' takes ${fn.arity === 1 ? "one value" : "two values"}`,
			);
		return { kind: "call", name: word, args };
	}
}

/** Reads one formula such as `x^2`. A leading `y =` or `f(x) =` is allowed. */
export function parseExpression(source: string): ParseResult {
	const text = source.replace(/^\s*(?:y|f\s*\(\s*x\s*\))\s*=/i, "");
	if (source.length > MAX_LENGTH)
		return {
			ok: false,
			message: `Formulas can be up to ${MAX_LENGTH} characters`,
		};
	if (!text.trim())
		return { ok: false, message: "Type a formula, like y = x^2" };
	try {
		const expr = new Parser(tokenize(text)).parse();
		if (depthOf(expr) > MAX_DEPTH)
			return { ok: false, message: "That formula is nested too deeply" };
		return { ok: true, expr };
	} catch (error) {
		if (error instanceof ParseError)
			return { ok: false, message: error.message };
		throw error;
	}
}

function cap(value: number): number {
	return Number.isFinite(value) && Math.abs(value) <= MAX_VALUE
		? value
		: Number.NaN;
}

function apply(op: "+" | "-" | "*" | "/" | "^", a: number, b: number): number {
	if (op === "+") return a + b;
	if (op === "-") return a - b;
	if (op === "*") return a * b;
	if (op === "/") return a / b;
	return a ** b;
}

/** The value of the formula at `x`; NaN where it has none (or it is huge). */
export function evaluate(expr: Expr, x: number): number {
	switch (expr.kind) {
		case "num":
			return expr.value;
		case "x":
			return x;
		case "neg":
			return -evaluate(expr.arg, x);
		case "bin":
			return cap(
				apply(expr.op, evaluate(expr.left, x), evaluate(expr.right, x)),
			);
		case "call": {
			const fn = FUNCTIONS.get(expr.name);
			if (!fn) return Number.NaN;
			return cap(fn.run(...expr.args.map((arg) => evaluate(arg, x))));
		}
	}
}

export interface PlotFunction {
	source: string;
	expr: Expr | null;
	/** Plain-words problem, when the formula can't be drawn. */
	error: string | null;
}

/** Splits the block's text at `;` and new lines (up to 4 formulas) and reads each. */
export function parseFunctions(text: string): PlotFunction[] {
	const lines = text
		.split(/[;\n]/)
		.map((line) => line.trim())
		.filter(Boolean);
	return lines.map((source, index) => {
		if (index >= MAX_FUNCTIONS)
			return {
				source,
				expr: null,
				error: `Only ${MAX_FUNCTIONS} formulas at a time`,
			};
		const parsed = parseExpression(source);
		return parsed.ok
			? { source, expr: parsed.expr, error: null }
			: { source, expr: null, error: parsed.message };
	});
}
