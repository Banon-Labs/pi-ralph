import { describe, expect, test } from "bun:test";
import { parseSearchWebArgs } from "./command.ts";

describe("parseSearchWebArgs", () => {
	test("defaults limit and captures query text", () => {
		expect(parseSearchWebArgs("rfc 9110 http semantics")).toEqual({
			query: "rfc 9110 http semantics",
			limit: 5,
		});
	});

	test("parses --limit before or after the query", () => {
		expect(parseSearchWebArgs("--limit 3 rfc 9110")).toEqual({ query: "rfc 9110", limit: 3 });
		expect(parseSearchWebArgs("rfc 9110 --limit=2")).toEqual({ query: "rfc 9110", limit: 2 });
	});

	test("rejects invalid limit values", () => {
		expect(() => parseSearchWebArgs("--limit 99 rfc 9110")).toThrow(/Usage/);
		expect(() => parseSearchWebArgs("--limit nope rfc 9110")).toThrow(/Usage/);
	});
});
