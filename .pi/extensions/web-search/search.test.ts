import { describe, expect, test } from "bun:test";
import { parseExaSearchResults, extractDuckDuckGoResults, rerankAuthoritativeResults } from "./providers.ts";
import { formatSearchSummary } from "./search.ts";

describe("parseExaSearchResults", () => {
	test("parses exa text payloads into ranked results", () => {
		const text = `Search Time: 123ms

Title: RFC 9110: HTTP Semantics
URL: https://www.rfc-editor.org/rfc/rfc9110.html
Published: 2022-06-01T00:00:00.000Z
Author: IETF
Highlights:
The RFC 9110 specification defines HTTP semantics.

Title: MDN HTTP resources and specifications
URL: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Resources_and_specifications
Highlights:
RFC 9110 | HTTP Semantics | Internet Standard`;

		const results = parseExaSearchResults(text, 5);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			title: "RFC 9110: HTTP Semantics",
			url: "https://www.rfc-editor.org/rfc/rfc9110.html",
			snippet: "The RFC 9110 specification defines HTTP semantics.",
			rank: 1,
		});
		expect(results[1]?.title).toBe("MDN HTTP resources and specifications");
	});
});

describe("extractDuckDuckGoResults", () => {
	test("parses duckduckgo-style result blocks and unwraps redirected urls", () => {
		const html = `
		<div class="result">
		  <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.rfc-editor.org%2Frfc%2Frfc9110.txt">HTTP Semantics</a>
		  <a class="result__snippet">Internet Engineering Task Force RFC 9110 text.</a>
		</div>
		<div class="result">
		  <a class="result__a" href="https://developer.mozilla.org/en-US/docs/Web/HTTP">MDN HTTP</a>
		  <div class="result__snippet">HTTP documentation from MDN.</div>
		</div>`;

		const results = extractDuckDuckGoResults(html, 5);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			title: "HTTP Semantics",
			url: "https://www.rfc-editor.org/rfc/rfc9110.txt",
			snippet: "Internet Engineering Task Force RFC 9110 text.",
			rank: 1,
		});
		expect(results[1]?.url).toBe("https://developer.mozilla.org/en-US/docs/Web/HTTP");
	});
});

describe("rerankAuthoritativeResults", () => {
	test("promotes official/spec sources for authority-seeking queries", () => {
		const reranked = rerankAuthoritativeResults(
			[
				{
					title: "HTTP resources and specifications - MDN Web Docs - Mozilla",
					url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Resources_and_specifications",
					rank: 1,
				},
				{
					title: "RFC 9110 - HTTP Semantics - IETF Datatracker",
					url: "https://datatracker.ietf.org/doc/html/rfc9110",
					rank: 2,
				},
			],
			"rfc 9110 http semantics",
		);

		expect(reranked[0]?.url).toBe("https://datatracker.ietf.org/doc/html/rfc9110");
		expect(reranked[0]?.rank).toBe(1);
	});
});

describe("formatSearchSummary", () => {
	test("renders ranked candidate results with local artifact paths", () => {
		const summary = formatSearchSummary({
			query: "rfc 9110 http semantics",
			provider: "exa-mcp",
			searchUrl: "https://mcp.exa.ai/mcp",
			cacheKey: "abc",
			resultCount: 1,
			results: [
				{
					title: "HTTP Semantics",
					url: "https://www.rfc-editor.org/rfc/rfc9110.txt",
					snippet: "Internet Engineering Task Force RFC 9110 text.",
					rank: 1,
				},
			],
			bodyPath: "/tmp/search.json",
			relativeBodyPath: ".pi/web-searches/ab/search.json",
			provenancePath: "/tmp/search.json.provenance.json",
			relativeProvenancePath: ".pi/web-searches/ab/search.json.provenance.json",
			fetchedAt: "2026-03-22T00:00:00.000Z",
			policyVersion: 1,
		});

		expect(summary).toContain("Provider: exa-mcp");
		expect(summary).toContain("1. HTTP Semantics");
		expect(summary).toContain(".pi/web-searches/ab/search.json");
	});
});
