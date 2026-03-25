export interface WebSearchResult {
	title: string;
	url: string;
	snippet?: string;
	rank: number;
}

export interface MaterializedWebSearch {
	query: string;
	provider: string;
	searchUrl: string;
	cacheKey: string;
	resultCount: number;
	results: WebSearchResult[];
	bodyPath: string;
	relativeBodyPath: string;
	provenancePath: string;
	relativeProvenancePath: string;
	fetchedAt: string;
	policyVersion: number;
}
