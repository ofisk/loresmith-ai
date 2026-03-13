-- Indexes for graph_dirty_relationships clearDirtyForEntities two-DELETE pattern
-- Enables index use for WHERE campaign_id = ? AND from_entity_id IN (...) and
-- WHERE campaign_id = ? AND to_entity_id IN (...) (avoids OR across columns)
CREATE INDEX IF NOT EXISTS idx_graph_dirty_relationships_campaign_from
  ON graph_dirty_relationships(campaign_id, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_dirty_relationships_campaign_to
  ON graph_dirty_relationships(campaign_id, to_entity_id);
