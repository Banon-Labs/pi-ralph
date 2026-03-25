import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { parseSearchWebArgs } from "./web-search/command.js";
import { COMMAND_NAME, DEFAULT_LIMIT, MAX_LIMIT, TOOL_NAME } from "./web-search/config.js";
import { formatSearchSummary, materializeWebSearch } from "./web-search/search.js";
import { buildAuthoritativeWorkflowNotice } from "./web-search/workflow.js";

const AUTHORITATIVE_COMMAND_NAME = "authoritative-web";

const SearchWebParams = Type.Object({
	query: Type.String({
		description: "Web search query for discovering candidate sources before retrieval.",
	}),
	limit: Type.Optional(
		Type.Integer({
			minimum: 1,
			maximum: MAX_LIMIT,
			description: `Maximum number of results to return. Defaults to ${DEFAULT_LIMIT}.`,
		}),
	),
});

async function searchForTool(query: string, limit: number, cwd: string, signal?: AbortSignal) {
	const search = await materializeWebSearch(query, cwd, { limit, signal });
	return {
		content: [{ type: "text" as const, text: formatSearchSummary(search) }],
		details: search,
	};
}

async function searchForCommand(pi: ExtensionAPI, query: string, limit: number, ctx: any) {
	try {
		const search = await materializeWebSearch(query, ctx.cwd, { limit });
		ctx.ui.notify(`Stored web search results in ${search.bodyPath}`, "success");
		pi.sendMessage({
			customType: TOOL_NAME,
			content: formatSearchSummary(search),
			details: search,
			display: true,
		});
		return search;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Web search failed: ${message}`, "error");
		pi.sendMessage({
			customType: TOOL_NAME,
			content: `Web search failed for ${query}\n${message}`,
			display: true,
		});
		return undefined;
	}
}

function parseCommandArgs(args: string, commandName: string): { query?: string; limit: number } | undefined {
	try {
		return parseSearchWebArgs(args);
	} catch (error) {
		throw new Error(
			error instanceof Error
				? error.message.replace(`/search-web`, `/${commandName}`)
				: `Usage: /${commandName} [--limit 1-${MAX_LIMIT}] <query>`,
		);
	}
}

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: TOOL_NAME,
		label: "Search Web",
		description:
			"Search the web for candidate sources, materialize the ranked results locally with provenance, and use them to choose URLs for subsequent fetch_web retrieval.",
		promptSnippet: "Search the web for candidate sources before fetching a specific authoritative page.",
		promptGuidelines: [
			"Use this tool for discovery when you do not yet know the right URL.",
			"After searching, prefer official or otherwise authoritative-looking results, then use fetch_web on the selected URL.",
		],
		parameters: SearchWebParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return searchForTool(params.query, params.limit ?? DEFAULT_LIMIT, ctx.cwd, signal);
		},
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Search the web for candidate sources and store ranked results in .pi/web-searches",
		handler: async (args, ctx) => {
			let parsed: { query?: string; limit: number };
			try {
				parsed = parseCommandArgs(args, COMMAND_NAME) ?? { limit: DEFAULT_LIMIT };
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
				return;
			}
			if (!parsed.query) {
				ctx.ui.notify(`Usage: /${COMMAND_NAME} [--limit 1-${MAX_LIMIT}] <query>`, "warning");
				return;
			}

			await searchForCommand(pi, parsed.query, parsed.limit, ctx);
		},
	});

	pi.registerCommand(AUTHORITATIVE_COMMAND_NAME, {
		description: "Search first, then show the recommended authoritative-answer fetch workflow for the query",
		handler: async (args, ctx) => {
			let parsed: { query?: string; limit: number };
			try {
				parsed = parseCommandArgs(args, AUTHORITATIVE_COMMAND_NAME) ?? { limit: DEFAULT_LIMIT };
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
				return;
			}
			if (!parsed.query) {
				ctx.ui.notify(`Usage: /${AUTHORITATIVE_COMMAND_NAME} [--limit 1-${MAX_LIMIT}] <query>`, "warning");
				return;
			}

			const search = await searchForCommand(pi, parsed.query, parsed.limit, ctx);
			if (!search) return;
			pi.sendMessage({
				customType: TOOL_NAME,
				content: buildAuthoritativeWorkflowNotice(search),
				display: true,
			});
		},
	});
}
