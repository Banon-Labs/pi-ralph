import type { NormalizedWebReference } from "./types.js";

const BLOCKED_HOSTNAMES = new Set(["localhost"]);
const TEXT_LIKE_PREFIXES = [
	"text/",
	"application/json",
	"application/javascript",
	"application/typescript",
	"application/x-typescript",
	"application/xml",
	"application/yaml",
	"application/x-yaml",
];

function isPrivateIpv4Literal(hostname: string): boolean {
	const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!match) return false;
	const octets = match.slice(1).map((part) => Number.parseInt(part, 10));
	if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return false;
	const [a, b] = octets;
	if (a === 10 || a === 127) return true;
	if (a === 169 && b === 254) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	if (a === 192 && b === 168) return true;
	return false;
}

function isBlockedIpv6Literal(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd");
}

function isBlockedHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	if (BLOCKED_HOSTNAMES.has(normalized)) return true;
	if (normalized.endsWith(".local")) return true;
	if (isPrivateIpv4Literal(normalized)) return true;
	if (isBlockedIpv6Literal(normalized)) return true;
	return false;
}

export function normalizeWebUrl(input: string): NormalizedWebReference {
	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}

	if (parsed.protocol !== "https:") {
		throw new Error(`Only HTTPS web content is allowed: ${input}`);
	}
	if (parsed.username || parsed.password) {
		throw new Error(`Credential-bearing URLs are not allowed: ${input}`);
	}
	if (isBlockedHostname(parsed.hostname)) {
		throw new Error(`Blocked host for web fetch: ${parsed.hostname}`);
	}
	parsed.hash = "";
	return {
		normalizedUrl: parsed.toString(),
		sourceKind: "direct-https",
	};
}

export function ensureWebTextLikeContentType(contentType: string): void {
	const normalized = contentType.toLowerCase();
	if (normalized.startsWith("text/html")) return;
	if (TEXT_LIKE_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return;
	if (normalized.startsWith("image/")) {
		throw new Error(
			`Fetched content type is image-based (${contentType}). fetch_web stays text-first for now; fetch a documentation page or other textual source instead.`,
		);
	}
	throw new Error(`Fetched content type is not allowed for text-first web fetch: ${contentType}`);
}

export function isHtmlContentType(contentType: string): boolean {
	return contentType.toLowerCase().startsWith("text/html");
}
