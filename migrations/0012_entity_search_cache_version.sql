-- Per-campaign version for entity search cache invalidation.
-- Incremented on entity create/update/delete; used in cache keys.
CREATE TABLE IF NOT EXISTS entity_search_cache_version (
  campaign_id TEXT PRIMARY KEY,
  cache_version INTEGER NOT NULL DEFAULT 0
);
