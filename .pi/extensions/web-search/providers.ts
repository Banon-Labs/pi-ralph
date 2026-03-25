import { DEFAULT_PROVIDER, DEFAULT_LIMIT, FETCH_TIMEOUT_MS, MAX_LIMIT, SEARCH_PROVIDER_ENV } from "./config.js";
import type { WebSearchResult } from "./types.js";

export interface SearchProviderResult {
	provider: string;
	searchUrl: string;
	results: WebSearchResult[];
}

export interface SearchProvider {
	id: string;
	search(query: string, limit: number, signal?: AbortSignal): Promise<SearchProviderResult>;
}

function createFetchController(signal?: AbortSignal): { controller: AbortController; cleanup: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error(`Search timed out after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS);
	const abortFromCaller = () => controller.abort(new Error("Search aborted"));
	signal?.addEventListener("abort", abortFromCaller, { once: true });
	return {
		controller,
		cleanup: () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abortFromCaller);
		},
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

function stripTags(text: string): string {
	return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function unwrapDuckDuckGoUrl(candidate: string): string {
	try {
		const parsed = new URL(candidate, "https://duckduckgo.com/html/");
		if (parsed.hostname === "duckduckgo.com" && parsed.pathname === "/l/") {
			const uddg = parsed.searchParams.get("uddg");
			if (uddg) return decodeURIComponent(uddg);
		}
		return parsed.toString();
	} catch {
		return candidate;
	}
}

export function extractDuckDuckGoResults(html: string, limit = DEFAULT_LIMIT): WebSearchResult[] {
	const results: WebSearchResult[] = [];
	const blockPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	let match: RegExpExecArray | null;

	while ((match = blockPattern.exec(html)) && results.length < limit) {
		const [, rawUrl, rawTitle] = match;
		const title = stripTags(rawTitle);
		const url = unwrapDuckDuckGoUrl(decodeHtmlEntities(rawUrl));
		if (!title || !url.startsWith("https://")) continue;

		const searchWindow = html.slice(match.index, match.index + 1500);
		const snippetMatch = searchWindow.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
			?? searchWindow.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
		const snippet = snippetMatch ? stripTags(snippetMatch[1]) : undefined;
		results.push({ title, url, snippet, rank: results.length + 1 });
	}

	return results;
}

const duckDuckGoProvider: SearchProvider = {
	id: "duckduckgo-html",
	async search(query, limit, signal) {
		const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
		const { controller, cleanup } = createFetchController(signal);
		try {
			const response = await fetch(searchUrl, {
				signal: controller.signal,
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; pi-helmsman-web-search/0.2)",
					Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
				},
			});
			if (!response.ok) throw new Error(`Search failed with ${response.status} ${response.statusText}`);
			const html = await response.text();
			return {
				provider: "duckduckgo-html",
				searchUrl,
				results: extractDuckDuckGoResults(html, limit),
			};
		} finally {
			cleanup();
		}
	},
};

export function parseExaSearchResults(text: string, limit = DEFAULT_LIMIT): WebSearchResult[] {
	const normalized = text.replace(/\r/g, "").trim();
	if (!normalized) return [];
	const rawBlocks = normalized.split(/\n\n(?=Title: )/g);
	const results: WebSearchResult[] = [];

	for (const block of rawBlocks) {
		if (results.length >= limit) break;
		const titleMatch = block.match(/^Title:\s*(.+)$/m);
		const urlMatch = block.match(/^URL:\s*(https?:\/\/\S+)$/m);
		if (!titleMatch || !urlMatch) continue;
		const highlightsMatch = block.match(/^Highlights:\s*([\s\S]*)$/m);
		const snippet = highlightsMatch?.[1]
			?.replace(/\n+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		results.push({
			title: titleMatch[1].trim(),
			url: urlMatch[1].trim(),
			snippet: snippet || undefined,
			rank: results.length + 1,
		});
	}

	return results;
}

const HIGH_AUTHORITY_HOSTS = new Set([
	"www.rfc-editor.org",
	"rfc-editor.org",
	"datatracker.ietf.org",
	"www.ietf.org",
	"ietf.org",
	"www.w3.org",
	"w3.org",
	"developer.mozilla.org",
	"docs.python.org",
	"nodejs.org",
	"www.rust-lang.org",
	"docs.rs",
	"www.typescriptlang.org",
	"www.postgresql.org",
]);

const MEDIUM_AUTHORITY_HOST_SUFFIXES = [
	".gov",
	".edu",
	"github.com",
	"docs.github.com",
	"docs.microsoft.com",
	"learn.microsoft.com",
	"docs.aws.amazon.com",
	"cloud.google.com",
];

function looksAuthoritySeekingQuery(query: string): boolean {
	return /\b(rfc|spec|specification|standard|official|docs|documentation|reference|api)\b/i.test(query);
}

function scoreAuthority(result: WebSearchResult, query: string): number {
	let score = 0;
	let hostname = "";
	try {
		hostname = new URL(result.url).hostname.toLowerCase();
	} catch {
		return score;
	}

	if (HIGH_AUTHORITY_HOSTS.has(hostname)) score += 50;
	if (MEDIUM_AUTHORITY_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(suffix))) score += 20;
	if (/\b(rfc|specification|reference|documentation|docs|standard)\b/i.test(result.title)) score += 10;
	if (/\bmirror\b/i.test(result.title) || /rfcinfo\.com$/i.test(hostname)) score -= 15;
	if (looksAuthoritySeekingQuery(query) && HIGH_AUTHORITY_HOSTS.has(hostname)) score += 30;
	if (looksAuthoritySeekingQuery(query) && /\b(rfc|specification|reference|standard)\b/i.test(result.title)) score += 10;
	return score;
}

export function rerankAuthoritativeResults(results: WebSearchResult[], query: string): WebSearchResult[] {
	return [...results]
		.map((result, index) => ({ result, index, score: scoreAuthority(result, query) }))
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map((entry, index) => ({ ...entry.result, rank: index + 1 }));
}

const exaProvider: SearchProvider = {
	id: "exa-mcp",
	async search(query, limit, signal) {
		const searchUrl = "https://mcp.exa.ai/mcp";
		const { controller, cleanup } = createFetchController(signal);
		try {
			const response = await fetch(searchUrl, {
				method: "POST",
				signal: controller.signal,
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "web_search_exa",
						arguments: {
							query,
							type: "auto",
							numResults: Math.min(Math.max(limit, 1), MAX_LIMIT),
							livecrawl: "fallback",
							contextMaxCharacters: 10_000,
						},
					},
				}),
			});
			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Search error (${response.status}): ${errorText}`);
			}
			const responseText = await response.text();
			const dataLine = responseText
				.split("\n")
				.find((line) => line.startsWith("data: "));
			if (!dataLine) throw new Error("Search response did not contain a data payload");
			const parsed = JSON.parse(dataLine.slice(6)) as { result?: { content?: Array<{ type?: string; text?: string }> } };
			const bodyText = parsed.result?.content?.find((entry) => entry.type === "text")?.text ?? "";
			return {
				provider: "exa-mcp",
				searchUrl,
				results: parseExaSearchResults(bodyText, limit),
			};
		} finally {
			cleanup();
		}
	},
};

const providers = new Map<string, SearchProvider>([
	[exaProvider.id, exaProvider],
	[duckDuckGoProvider.id, duckDuckGoProvider],
]);

export function resolveSearchProvider(): SearchProvider {
	const requested = process.env[SEARCH_PROVIDER_ENV]?.trim().toLowerCase() || DEFAULT_PROVIDER;
	return providers.get(requested) ?? providers.get(DEFAULT_PROVIDER) ?? exaProvider;
}
