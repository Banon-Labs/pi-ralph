import { describe, expect, test } from "bun:test";
import { buildAuthoritativeWorkflowNotice } from "./workflow.ts";

describe("buildAuthoritativeWorkflowNotice", () => {
	test("turns search results into a grounded search-then-fetch workflow", () => {
		const notice = buildAuthoritativeWorkflowNotice({
			query: "rfc 9110 http semantics",
			provider: "duckduckgo-html",
			searchUrl: "https://duckduckgo.com/html/?q=rfc%209110",
			cacheKey: "abc",
			resultCount: 2,
			results: [
				{ title: "RFC 9110: HTTP Semantics", url: "https://www.rfc-editor.org/rfc/rfc9110.html", rank: 1 },
				{ title: "MDN HTTP", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP", rank: 2 },
			],
			bodyPath: "/tmp/search.json",
			relativeBodyPath: ".pi/web-searches/ab/search.json",
			provenancePath: "/tmp/search.json.provenance.json",
			relativeProvenancePath: ".pi/web-searches/ab/search.json.provenance.json",
			fetchedAt: "2026-03-22T00:00:00.000Z",
			policyVersion: 1,
		});

		expect(notice).toContain("Authoritative-answer workflow:");
		expect(notice).toContain("- RFC 9110: HTTP Semantics");
		expect(notice).toContain("/fetch-web --format markdown <url>");
		expect(notice).toContain("local file path");
	});
});
