import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CACHE_ROOT, DEFAULT_LIMIT, MAX_LIMIT, POLICY_VERSION } from "./config.js";
import { rerankAuthoritativeResults, resolveSearchProvider } from "./providers.js";
import type { MaterializedWebSearch } from "./types.js";

function buildPaths(cwd: string, query: string) {
	const cacheKey = createHash("sha256").update(query).digest("hex");
	const dir = join(cwd, CACHE_ROOT, cacheKey.slice(0, 2), cacheKey);
	const fileName = `search-${cacheKey.slice(0, 12)}.json`;
	return {
		cacheKey,
		dir,
		bodyPath: join(dir, fileName),
		relativeBodyPath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, fileName),
		provenancePath: join(dir, `${fileName}.provenance.json`),
		relativeProvenancePath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, `${fileName}.provenance.json`),
	};
}

export async function materializeWebSearch(
	query: string,
	cwd: string,
	options?: { limit?: number; signal?: AbortSignal },
): Promise<MaterializedWebSearch> {
	const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const provider = resolveSearchProvider();
	const searchResult = await provider.search(query, limit, options?.signal);
	const rerankedResults = rerankAuthoritativeResults(searchResult.results, query).slice(0, limit);
	const paths = buildPaths(cwd, `${provider.id}\n${query}\nlimit=${limit}`);
	await mkdir(paths.dir, { recursive: true });
	const materialized: MaterializedWebSearch = {
		query,
		provider: searchResult.provider,
		searchUrl: searchResult.searchUrl,
		cacheKey: paths.cacheKey,
		resultCount: rerankedResults.length,
		results: rerankedResults,
		bodyPath: paths.bodyPath,
		relativeBodyPath: paths.relativeBodyPath,
		provenancePath: paths.provenancePath,
		relativeProvenancePath: paths.relativeProvenancePath,
		fetchedAt: new Date().toISOString(),
		policyVersion: POLICY_VERSION,
	};
	await writeFile(materialized.bodyPath, `${JSON.stringify(materialized, null, 2)}\n`, "utf8");
	await writeFile(
		materialized.provenancePath,
		`${JSON.stringify(
			{
				version: 1,
				provider: materialized.provider,
				policyVersion: POLICY_VERSION,
				query,
				searchUrl: materialized.searchUrl,
				limit,
				resultCount: materialized.resultCount,
				bodyPath: materialized.bodyPath,
				relativeBodyPath: materialized.relativeBodyPath,
				provenancePath: materialized.provenancePath,
				relativeProvenancePath: materialized.relativeProvenancePath,
				fetchedAt: materialized.fetchedAt,
				constraints: { maxLimit: MAX_LIMIT },
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	return materialized;
}

export function formatSearchSummary(search: MaterializedWebSearch): string {
	return [
		`Web search query: ${search.query}`,
		`Provider: ${search.provider}`,
		`Policy version: ${search.policyVersion}`,
		`Search URL: ${search.searchUrl}`,
		`Results: ${search.resultCount}`,
		`Local file: ${search.relativeBodyPath}`,
		`Provenance: ${search.relativeProvenancePath}`,
		"",
		"Top results:",
		search.results.length
			? search.results
					.map((result) => `${result.rank}. ${result.title}\n   ${result.url}${result.snippet ? `\n   ${result.snippet}` : ""}`)
					.join("\n")
			: "(no results found)",
	].join("\n");
}
