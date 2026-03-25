import { describe, expect, test } from "bun:test";
import { parseFetchWebArgs } from "./command.ts";

describe("parseFetchWebArgs", () => {
	test("defaults to markdown format when only a url is provided", () => {
		expect(parseFetchWebArgs("https://example.com/docs")).toEqual({
			url: "https://example.com/docs",
			format: "markdown",
		});
	});

	test("parses explicit --format values before or after the url", () => {
		expect(parseFetchWebArgs("--format text https://example.com/docs")).toEqual({
			url: "https://example.com/docs",
			format: "text",
		});
		expect(parseFetchWebArgs("https://example.com/docs --format=html")).toEqual({
			url: "https://example.com/docs",
			format: "html",
		});
	});

	test("rejects invalid extra arguments or unsupported formats", () => {
		expect(() => parseFetchWebArgs("https://example.com/docs extra")).toThrow(/Usage/);
		expect(() => parseFetchWebArgs("--format pdf https://example.com/docs")).toThrow(/Usage/);
	});
});
