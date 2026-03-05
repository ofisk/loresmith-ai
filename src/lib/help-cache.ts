/**
 * Client-side cache for help responses to avoid repeated LLM calls.
 * TTL: 10 minutes.
 */

const CACHE_KEY_PREFIX = "loresmith-help-cache-";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface CachedHelp {
	content: string;
	timestamp: number;
}

export function getCachedHelp(action: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = sessionStorage.getItem(`${CACHE_KEY_PREFIX}${action}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedHelp;
		if (!parsed?.content || typeof parsed.content !== "string") return null;
		if (Date.now() - parsed.timestamp > TTL_MS) {
			sessionStorage.removeItem(`${CACHE_KEY_PREFIX}${action}`);
			return null;
		}
		return parsed.content;
	} catch {
		return null;
	}
}

export function setCachedHelp(action: string, content: string): void {
	if (typeof window === "undefined") return;
	try {
		sessionStorage.setItem(
			`${CACHE_KEY_PREFIX}${action}`,
			JSON.stringify({ content, timestamp: Date.now() } satisfies CachedHelp)
		);
	} catch {
		// ignore
	}
}
