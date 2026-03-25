import type { MaterializedWebSearch } from "./types.js";

export function buildAuthoritativeWorkflowNotice(search: MaterializedWebSearch): string {
	const candidateLines = search.results
		.slice(0, 3)
		.map((result) => `   - ${result.title}\n     ${result.url}`)
		.join("\n");

	return [
		"Authoritative-answer workflow:",
		"1. Review these results and prefer the source that looks official, specification-backed, or maintainer-owned.",
		candidateLines || "   - (no candidates found)",
		"2. Fetch the chosen page with `/fetch-web --format markdown <url>` so the exact source is materialized locally with provenance.",
		"3. Answer from the fetched artifact, and include the source URL, local file path, a short quote or excerpt, and any remaining uncertainty.",
	].join("\n");
}
