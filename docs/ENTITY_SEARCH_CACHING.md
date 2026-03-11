# Entity search results caching

Caches semantic search results for entity search to avoid repeated embedding generation and Vectorize queries when the same campaign and query are searched again.

## Design

- **Storage:** Cloudflare Cache API (`caches.default`)
- **TTL:** 5 minutes via `Cache-Control: max-age=300`
- **Cache key format:** `entity-search/${campaignId}/v${version}/${hash}`
- **Hash input:** `campaignId:normalizedQuery:entityType:topK`
- **Version-based invalidation:** Per-campaign version in D1; incremented on entity create/update/delete

## Entry points

1. **searchCampaignContext** (`src/tools/campaign-context/search-tools.ts`) – agent gameplay
2. **handleSearchEntityInGraph** (`src/routes/graph-visualization.ts`) – graph UI search

## Flow

1. Check cache before running semantic search (embedding + Vectorize).
2. On cache hit: use cached entity IDs and scores, fetch full entities from DB.
3. On cache miss: run semantic search, then store result in cache.

## Invalidation

When any entity in a campaign is created, updated, or deleted, `EntitySearchCacheService.incrementCampaignCacheVersion` is called from `EntityDAO`. The version is stored in `entity_search_cache_version` (D1). Old cache keys reference the previous version and are effectively stale; new searches use the updated version.

## Profiling and metrics

- **searchCampaignContext:** Logs `[Tool] searchCampaignContext - Semantic search cache hit: N entities` on cache hit, or `Semantic search found N entities via embeddings in Xms` on miss.
- To measure hit rate: count log lines containing "cache hit" vs "via embeddings" over a time window.

## D1 table

```sql
CREATE TABLE IF NOT EXISTS entity_search_cache_version (
  campaign_id TEXT PRIMARY KEY,
  cache_version INTEGER NOT NULL DEFAULT 0
);
```

## Files

| File | Purpose |
|------|---------|
| `migrations/0012_entity_search_cache_version.sql` | D1 schema |
| `src/services/search/entity-search-cache-service.ts` | Cache get/set, version read/increment |
| `src/dao/entity-dao.ts` | Calls invalidation on entity CUD |
| `src/tools/campaign-context/search-tools.ts` | Cache integration in searchCampaignContext |
| `src/routes/graph-visualization.ts` | Cache integration in handleSearchEntityInGraph |
