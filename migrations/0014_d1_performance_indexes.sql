-- Performance indexes for hot query paths (issue #490)
-- Add missing indexes identified by DAO audit; improves entity_relationships, file_metadata,
-- campaigns, campaign_resources, shard_registry, communities, entity_deduplication_pending, entity_extraction_queue.

-- entity_relationships (critical for graph queries; enables UNION-based batch lookups)
CREATE INDEX IF NOT EXISTS idx_entity_relationships_from ON entity_relationships(from_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_to ON entity_relationships(to_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_relationships_campaign_type ON entity_relationships(campaign_id, relationship_type);

-- file_metadata (user-scoped queries, stuck-file cleanup)
CREATE INDEX IF NOT EXISTS idx_file_metadata_username ON file_metadata(username);
CREATE INDEX IF NOT EXISTS idx_file_metadata_username_status ON file_metadata(username, status);
CREATE INDEX IF NOT EXISTS idx_file_metadata_status_updated ON file_metadata(status, updated_at);

-- campaigns (user campaign listing)
CREATE INDEX IF NOT EXISTS idx_campaigns_username ON campaigns(username);
CREATE INDEX IF NOT EXISTS idx_campaigns_username_updated ON campaigns(username, updated_at DESC);

-- campaign_resources (resource listing, duplicate checks)
CREATE INDEX IF NOT EXISTS idx_campaign_resources_campaign ON campaign_resources(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_resources_campaign_file ON campaign_resources(campaign_id, file_key);

-- shard_registry (campaign and resource lookups)
CREATE INDEX IF NOT EXISTS idx_shard_registry_campaign ON shard_registry(campaign_id);
CREATE INDEX IF NOT EXISTS idx_shard_registry_resource ON shard_registry(resource_id);
CREATE INDEX IF NOT EXISTS idx_shard_registry_campaign_status ON shard_registry(campaign_id, status);

-- communities (campaign and hierarchy lookups)
CREATE INDEX IF NOT EXISTS idx_communities_campaign ON communities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_communities_parent ON communities(parent_community_id);

-- entity_deduplication_pending (pending dedup lookup)
CREATE INDEX IF NOT EXISTS idx_entity_dedup_campaign_status ON entity_deduplication_pending(campaign_id, status);

-- entity_extraction_queue (getPendingQueueItems, getStuckProcessingItems)
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_retry ON entity_extraction_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_entity_extraction_queue_status_updated ON entity_extraction_queue(status, updated_at);
