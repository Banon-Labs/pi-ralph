import { COMMAND_NAME, DEFAULT_LIMIT, MAX_LIMIT } from "./config.js";

export function parseSearchWebArgs(args: string): { query?: string; limit: number } {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let limit = DEFAULT_LIMIT;
	const queryTokens: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--limit") {
			const candidate = tokens[index + 1];
			const parsed = Number.parseInt(candidate ?? "", 10);
			if (!candidate || !Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
				throw new Error(`Usage: /${COMMAND_NAME} [--limit 1-${MAX_LIMIT}] <query>`);
			}
			limit = parsed;
			index += 1;
			continue;
		}
		if (token.startsWith("--limit=")) {
			const parsed = Number.parseInt(token.slice("--limit=".length), 10);
			if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
				throw new Error(`Usage: /${COMMAND_NAME} [--limit 1-${MAX_LIMIT}] <query>`);
			}
			limit = parsed;
			continue;
		}
		queryTokens.push(token);
	}

	return {
		query: queryTokens.join(" ").trim() || undefined,
		limit,
	};
}
