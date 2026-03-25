import { COMMAND_NAME } from "./config.js";
import type { WebContentFormat } from "./types.js";

const WEB_FORMATS = ["text", "markdown", "html"] as const;

export function parseFetchWebArgs(args: string): { url?: string; format: WebContentFormat } {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	let format: WebContentFormat = "markdown";
	let url: string | undefined;

	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token === "--format") {
			const candidate = tokens[index + 1];
			if (!candidate || !WEB_FORMATS.includes(candidate as WebContentFormat)) {
				throw new Error(`Usage: /${COMMAND_NAME} [--format text|markdown|html] <https-url>`);
			}
			format = candidate as WebContentFormat;
			index += 1;
			continue;
		}
		if (token.startsWith("--format=")) {
			const candidate = token.slice("--format=".length);
			if (!WEB_FORMATS.includes(candidate as WebContentFormat)) {
				throw new Error(`Usage: /${COMMAND_NAME} [--format text|markdown|html] <https-url>`);
			}
			format = candidate as WebContentFormat;
			continue;
		}
		if (!url) {
			url = token;
			continue;
		}
		throw new Error(`Usage: /${COMMAND_NAME} [--format text|markdown|html] <https-url>`);
	}

	return { url, format };
}
