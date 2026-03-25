import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { CACHE_ROOT, FETCH_TIMEOUT_MS, MAX_BYTES, POLICY_VERSION } from "./config.js";
import { ensureWebTextLikeContentType, isHtmlContentType, normalizeWebUrl } from "./policy.js";
import type { MaterializedWebContent, WebContentFormat } from "./types.js";

function deriveExtension(contentType: string, pathname: string): string {
	const byPath = extname(pathname);
	if (byPath) return byPath;
	const normalized = contentType.toLowerCase();
	if (normalized.startsWith("text/html")) return ".html";
	if (normalized.startsWith("application/json")) return ".json";
	if (normalized.startsWith("application/xml") || normalized.startsWith("text/xml")) return ".xml";
	if (normalized.startsWith("application/yaml") || normalized.startsWith("application/x-yaml")) return ".yaml";
	if (normalized.startsWith("text/markdown")) return ".md";
	return ".txt";
}

function deriveFileName(referenceUrl: string, contentType: string, cacheKey: string): string {
	const parsed = new URL(referenceUrl);
	const rawName = basename(parsed.pathname) || "web-content";
	const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, "-") || "web-content";
	const extension = extname(safeBase) || deriveExtension(contentType, parsed.pathname);
	const stem = safeBase.slice(0, safeBase.length - extname(safeBase).length) || "web-content";
	return `${stem}-${cacheKey.slice(0, 12)}${extension}`;
}

function createFetchController(signal?: AbortSignal): { controller: AbortController; cleanup: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error(`Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS);
	const abortFromCaller = () => controller.abort(new Error("Fetch aborted"));
	signal?.addEventListener("abort", abortFromCaller, { once: true });
	return {
		controller,
		cleanup: () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abortFromCaller);
		},
	};
}

function assertDeclaredLength(declaredLength: string | null): void {
	if (!declaredLength) return;
	const parsedLength = Number.parseInt(declaredLength, 10);
	if (Number.isFinite(parsedLength) && parsedLength > MAX_BYTES) {
		throw new Error(`Remote content length ${parsedLength} exceeds ${MAX_BYTES} byte limit`);
	}
}

function buildReferencePaths(cwd: string, normalizedUrl: string, contentType: string) {
	const cacheKey = createHash("sha256").update(normalizedUrl).digest("hex");
	const dir = join(cwd, CACHE_ROOT, cacheKey.slice(0, 2), cacheKey);
	const fileName = deriveFileName(normalizedUrl, contentType, cacheKey);
	return {
		cacheKey,
		dir,
		bodyPath: join(dir, fileName),
		relativeBodyPath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, fileName),
		provenancePath: join(dir, `${fileName}.provenance.json`),
		relativeProvenancePath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, `${fileName}.provenance.json`),
	};
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'");
}

function extractHtmlTitle(html: string): string | undefined {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	if (!match) return undefined;
	const title = decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim());
	return title || undefined;
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
		.replace(/<template[\s\S]*?<\/template>/gi, " ");
}

function normalizeWhitespace(text: string): string {
	return decodeHtmlEntities(text)
		.replace(/\r/g, "")
		.replace(/\t/g, " ")
		.replace(/[ ]{2,}/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function htmlToText(html: string): string {
	const stripped = stripHtml(html)
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|section|article|li|ul|ol|h1|h2|h3|h4|h5|h6|main|header|footer)>/gi, "\n")
		.replace(/<[^>]+>/g, " ");
	return normalizeWhitespace(stripped);
}

function htmlToMarkdown(html: string): string {
	const withoutUnsafe = stripHtml(html)
		.replace(/<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
			const label = normalizeWhitespace(text.replace(/<[^>]+>/g, " ")) || href;
			return `[${label}](${href})`;
		})
		.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
		.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
		.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
		.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
		.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n")
		.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n")
		.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|section|article|ul|ol|main|header|footer)>/gi, "\n\n")
		.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, "**$2**")
		.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, "*$2*")
		.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
		.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "\n```\n$1\n```\n")
		.replace(/<[^>]+>/g, " ");
	return normalizeWhitespace(withoutUnsafe);
}

function buildPreview(text: string, maxChars = 4000): string {
	const trimmed = text.trim();
	if (!trimmed) return "(no preview text)";
	return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars).trimEnd()}\n\n[Preview truncated]`;
}

function buildAcceptHeader(format: WebContentFormat): string {
	switch (format) {
		case "html":
			return "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.7, application/json;q=0.5, */*;q=0.1";
		case "text":
			return "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, application/json;q=0.6, */*;q=0.1";
		case "markdown":
		default:
			return "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, application/json;q=0.6, */*;q=0.1";
	}
}

function renderPreviewSource(rawText: string, contentType: string, format: WebContentFormat): string {
	if (format === "html") return rawText;
	if (!isHtmlContentType(contentType)) return rawText;
	return format === "markdown" ? htmlToMarkdown(rawText) : htmlToText(rawText);
}

function buildProvenance(reference: MaterializedWebContent) {
	return {
		version: 1,
		policyVersion: reference.policyVersion,
		originalUrl: reference.originalUrl,
		normalizedUrl: reference.normalizedUrl,
		sourceKind: reference.sourceKind,
		fetchedAt: reference.fetchedAt,
		contentType: reference.contentType,
		byteLength: reference.byteLength,
		sha256: reference.sha256,
		cacheKey: reference.cacheKey,
		bodyPath: reference.bodyPath,
		relativeBodyPath: reference.relativeBodyPath,
		provenancePath: reference.provenancePath,
		relativeProvenancePath: reference.relativeProvenancePath,
		title: reference.title,
		requestedFormat: reference.requestedFormat,
		constraints: {
			maxBytes: MAX_BYTES,
			fetchTimeoutMs: FETCH_TIMEOUT_MS,
			mode: "https-materialized-web-fetch",
		},
	};
}

export async function materializeWebContent(
	url: string,
	cwd: string,
	options?: { format?: WebContentFormat; signal?: AbortSignal },
): Promise<MaterializedWebContent> {
	const format = options?.format ?? "markdown";
	const signal = options?.signal;
	const { normalizedUrl, sourceKind } = normalizeWebUrl(url);
	const { controller, cleanup } = createFetchController(signal);
	try {
		const response = await fetch(normalizedUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "pi-helmsman-web-content/0.2",
				Accept: buildAcceptHeader(format),
			},
		});
		if (!response.ok) {
			throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
		}
		assertDeclaredLength(response.headers.get("content-length"));
		const contentType = response.headers.get("content-type") ?? "text/plain";
		ensureWebTextLikeContentType(contentType);

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.byteLength > MAX_BYTES) {
			throw new Error(`Fetched content exceeds ${MAX_BYTES} byte limit after download (${buffer.byteLength} bytes)`);
		}
		const rawText = buffer.toString("utf8");
		const previewText = buildPreview(renderPreviewSource(rawText, contentType, format));
		const title = isHtmlContentType(contentType) ? extractHtmlTitle(rawText) : undefined;
		const paths = buildReferencePaths(cwd, normalizedUrl, contentType);
		await mkdir(paths.dir, { recursive: true });

		const reference: MaterializedWebContent = {
			originalUrl: url,
			normalizedUrl,
			sourceKind,
			cacheKey: paths.cacheKey,
			bodyPath: paths.bodyPath,
			relativeBodyPath: paths.relativeBodyPath,
			provenancePath: paths.provenancePath,
			relativeProvenancePath: paths.relativeProvenancePath,
			contentType,
			byteLength: buffer.byteLength,
			sha256: createHash("sha256").update(buffer).digest("hex"),
			fetchedAt: new Date().toISOString(),
			policyVersion: POLICY_VERSION,
			requestedFormat: format,
			title,
			previewText,
		};

		await writeFile(reference.bodyPath, rawText, "utf8");
		await writeFile(reference.provenancePath, `${JSON.stringify(buildProvenance(reference), null, 2)}\n`, "utf8");
		return reference;
	} finally {
		cleanup();
	}
}

export function formatSummary(reference: MaterializedWebContent): string {
	return [
		`Fetched web content: ${reference.normalizedUrl}`,
		reference.title ? `Title: ${reference.title}` : undefined,
		`Requested format: ${reference.requestedFormat}`,
		`Policy version: ${reference.policyVersion}`,
		`Local file: ${reference.relativeBodyPath}`,
		`Provenance: ${reference.relativeProvenancePath}`,
		`Content-Type: ${reference.contentType}`,
		`Bytes: ${reference.byteLength}`,
		`SHA-256: ${reference.sha256}`,
		"",
		"Preview:",
		reference.previewText,
	]
		.filter(Boolean)
		.join("\n");
}
