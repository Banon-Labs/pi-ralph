import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { materializeWebContent } from "./materialize.ts";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
	globalThis.fetch = originalFetch;
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "pi-helmsman-web-content-"));
	tempDirs.push(dir);
	return dir;
}

describe("materializeWebContent", () => {
	test("writes fetched html, provenance, title, and markdown preview locally", async () => {
		globalThis.fetch = async () =>
			new Response(
				"<html><head><title>Example Domain</title></head><body><main><h1>Hello</h1><p>World</p><a href=\"https://example.com/docs\">Docs</a></main></body></html>",
				{
					status: 200,
					headers: {
						"content-type": "text/html; charset=utf-8",
						"content-length": "155",
					},
				},
			);

		const cwd = await createTempDir();
		const reference = await materializeWebContent("https://example.com/", cwd, { format: "markdown" });

		expect(reference.sourceKind).toBe("direct-https");
		expect(reference.title).toBe("Example Domain");
		expect(reference.requestedFormat).toBe("markdown");
		expect(reference.previewText).toContain("# Hello");
		expect(reference.previewText).toContain("[Docs](https://example.com/docs)");
		expect(reference.relativeBodyPath).toContain(".pi/web-refs/");

		const body = await readFile(reference.bodyPath, "utf8");
		expect(body).toContain("<title>Example Domain</title>");

		const provenance = JSON.parse(await readFile(reference.provenancePath, "utf8"));
		expect(provenance.originalUrl).toBe("https://example.com/");
		expect(provenance.normalizedUrl).toBe("https://example.com/");
		expect(provenance.title).toBe("Example Domain");
		expect(provenance.requestedFormat).toBe("markdown");
		expect(provenance.constraints.mode).toBe("https-materialized-web-fetch");
	});

	test("returns raw html preview when html format is requested", async () => {
		globalThis.fetch = async () =>
			new Response("<html><body><h1>Hello</h1></body></html>", {
				status: 200,
				headers: { "content-type": "text/html; charset=utf-8" },
			});

		const cwd = await createTempDir();
		const reference = await materializeWebContent("https://example.com/html", cwd, { format: "html" });

		expect(reference.requestedFormat).toBe("html");
		expect(reference.previewText).toContain("<h1>Hello</h1>");
	});
});
