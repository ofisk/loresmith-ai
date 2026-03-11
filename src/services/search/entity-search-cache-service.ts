/**
 * Entity search result caching via Cloudflare Cache API.
 * Caches semantic search results (entity IDs + scores) to avoid repeated
 * embedding generation and Vectorize queries for the same campaign/query.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { logger } from "@/lib/logger";

const CACHE_TTL_SEC = 300; // 5 minutes
const CACHE_KEY_PREFIX = "https://cache/internal/entity-search";

export interface CachedEntitySearchResult {
	entityIds: string[];
	scores: number[];
}

/**
 * Simple hash for cache keys (same style as ContextAssemblyService).
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36);
}

/**
 * Build cache key from campaign, version, and query params.
 */
export function buildCacheKey(
	campaignId: string,
	cacheVersion: number,
	normalizedQuery: string,
	entityType: string | undefined,
	topK: number
): string {
	const payload = `${campaignId}:${normalizedQuery}:${entityType ?? ""}:${topK}`;
	const hash = simpleHash(payload);
	return `${CACHE_KEY_PREFIX}/${campaignId}/v${cacheVersion}/${hash}`;
}

/**
 * Get campaign cache version from D1. Inserts row if missing.
 */
export async function getCampaignCacheVersion(
	db: D1Database,
	campaignId: string
): Promise<number> {
	try {
		const row = await db
			.prepare(
				"SELECT cache_version FROM entity_search_cache_version WHERE campaign_id = ?"
			)
			.bind(campaignId)
			.first<{ cache_version: number }>();

		if (row) {
			return row.cache_version;
		}

		await db
			.prepare(
				"INSERT OR IGNORE INTO entity_search_cache_version (campaign_id, cache_version) VALUES (?, 0)"
			)
			.bind(campaignId)
			.run();

		const after = await db
			.prepare(
				"SELECT cache_version FROM entity_search_cache_version WHERE campaign_id = ?"
			)
			.bind(campaignId)
			.first<{ cache_version: number }>();

		return after?.cache_version ?? 0;
	} catch (error) {
		logger
			.scope("[EntitySearchCache]")
			.warn("Failed to get campaign cache version, using 0", {
				campaignId,
				error,
			});
		return 0;
	}
}

/**
 * Increment campaign cache version (invalidates all cached searches for that campaign).
 * Called from EntityDAO on entity create/update/delete.
 */
export async function incrementCampaignCacheVersion(
	db: D1Database,
	campaignId: string
): Promise<void> {
	try {
		await db
			.prepare(
				`INSERT INTO entity_search_cache_version (campaign_id, cache_version)
         VALUES (?, 1)
         ON CONFLICT(campaign_id) DO UPDATE SET cache_version = cache_version + 1`
			)
			.bind(campaignId)
			.run();
	} catch (error) {
		logger
			.scope("[EntitySearchCache]")
			.warn("Failed to increment campaign cache version", {
				campaignId,
				error,
			});
	}
}

/**
 * Fetch cached semantic search result if present.
 */
export async function getCachedSearchResult(
	cacheKey: string
): Promise<CachedEntitySearchResult | null> {
	try {
		const cache = (globalThis as unknown as { caches: { default: Cache } })
			.caches.default;
		const request = new Request(cacheKey);
		const cached = await cache.match(request);
		if (!cached || !cached.ok) return null;
		const body = (await cached.json()) as CachedEntitySearchResult;
		if (!body?.entityIds || !Array.isArray(body.entityIds)) return null;
		return {
			entityIds: body.entityIds,
			scores: Array.isArray(body.scores) ? body.scores : [],
		};
	} catch {
		return null;
	}
}

/**
 * Store semantic search result in cache.
 */
export async function setCachedSearchResult(
	cacheKey: string,
	result: CachedEntitySearchResult
): Promise<void> {
	try {
		const cache = (globalThis as unknown as { caches: { default: Cache } })
			.caches.default;
		const request = new Request(cacheKey);
		const response = new Response(JSON.stringify(result), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": `max-age=${CACHE_TTL_SEC}`,
			},
		});
		await cache.put(request, response);
	} catch (error) {
		logger
			.scope("[EntitySearchCache]")
			.warn("Failed to store search result in cache", {
				cacheKey: cacheKey.slice(0, 80),
				error,
			});
	}
}
