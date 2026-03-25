import { describe, expect, test } from "bun:test";
import { ensureWebTextLikeContentType, normalizeWebUrl } from "./policy.ts";

describe("normalizeWebUrl", () => {
	test("accepts normal https urls and strips fragments", () => {
		expect(normalizeWebUrl("https://example.com/docs/page#section")).toEqual({
			normalizedUrl: "https://example.com/docs/page",
			sourceKind: "direct-https",
		});
	});

	test("rejects non-https and credential-bearing urls", () => {
		expect(() => normalizeWebUrl("http://example.com")).toThrow(/Only HTTPS/);
		expect(() => normalizeWebUrl("https://user:pass@example.com")).toThrow(/Credential-bearing/);
	});

	test("rejects localhost and private-network literals", () => {
		expect(() => normalizeWebUrl("https://localhost/test")).toThrow(/Blocked host/);
		expect(() => normalizeWebUrl("https://127.0.0.1/test")).toThrow(/Blocked host/);
		expect(() => normalizeWebUrl("https://192.168.1.10/test")).toThrow(/Blocked host/);
		expect(() => normalizeWebUrl("https://internal.local/test")).toThrow(/Blocked host/);
	});
});

describe("ensureWebTextLikeContentType", () => {
	test("accepts html and text-like responses", () => {
		expect(() => ensureWebTextLikeContentType("text/html; charset=utf-8")).not.toThrow();
		expect(() => ensureWebTextLikeContentType("text/plain")).not.toThrow();
		expect(() => ensureWebTextLikeContentType("application/json")).not.toThrow();
	});

	test("rejects binary-like responses", () => {
		expect(() => ensureWebTextLikeContentType("application/pdf")).toThrow(/not allowed/);
		expect(() => ensureWebTextLikeContentType("image/png")).toThrow(/stays text-first/);
	});
});
