-- One row, one column per table: row counts (scalar subqueries; no compound UNION).
-- Run against your D1 (e.g. dev or prod) after you are logged in to Wrangler, or with CLOUDFLARE_API_TOKEN.
--
-- Run via scripts/run-d1-table-counts.sh, or with --file inlined as --command (see script).
-- Wrangler often omits the result row for --file; the script uses --command so you see counts.
-- Dev:  ./scripts/run-d1-table-counts.sh
-- Prod: ./scripts/run-d1-table-counts.sh loresmith-db wrangler.jsonc
--
-- If a subquery errors with "no such table", that table is missing from this database (or typo).
-- file_metadata_fts* FTS5 shadow tables are NOT included here: many D1s never created the
--   virtual table (file search still uses file_metadata). See scripts/d1-fts-shadow-counts.sql
-- If sqlite_sequence is missing, see scripts/d1-legacy-optional-counts.sql
SELECT
  (SELECT COUNT(*) FROM campaign_characters) AS campaign_characters,
  (SELECT COUNT(*) FROM campaign_checklist_status) AS campaign_checklist_status,
  (SELECT COUNT(*) FROM campaign_context) AS campaign_context,
  (SELECT COUNT(*) FROM campaign_members) AS campaign_members,
  (SELECT COUNT(*) FROM campaign_resource_proposals) AS campaign_resource_proposals,
  (SELECT COUNT(*) FROM campaign_resources) AS campaign_resources,
  (SELECT COUNT(*) FROM campaign_session_plan_readout_chunks) AS campaign_session_plan_readout_chunks,
  (SELECT COUNT(*) FROM campaign_session_plan_readouts) AS campaign_session_plan_readouts,
  (SELECT COUNT(*) FROM campaign_share_links) AS campaign_share_links,
  (SELECT COUNT(*) FROM campaigns) AS campaigns,
  (SELECT COUNT(*) FROM changelog_archive_metadata) AS changelog_archive_metadata,
  (SELECT COUNT(*) FROM character_sheets) AS character_sheets,
  (SELECT COUNT(*) FROM communities) AS communities,
  (SELECT COUNT(*) FROM community_entities) AS community_entities,
  (SELECT COUNT(*) FROM community_summaries) AS community_summaries,
  (SELECT COUNT(*) FROM d1_migrations) AS d1_migrations,
  (SELECT COUNT(*) FROM email_verification_tokens) AS email_verification_tokens,
  (SELECT COUNT(*) FROM entities) AS entities,
  (SELECT COUNT(*) FROM entity_deduplication_pending) AS entity_deduplication_pending,
  (SELECT COUNT(*) FROM entity_extraction_queue) AS entity_extraction_queue,
  (SELECT COUNT(*) FROM entity_importance) AS entity_importance,
  (SELECT COUNT(*) FROM entity_relationships) AS entity_relationships,
  (SELECT COUNT(*) FROM entity_search_cache_version) AS entity_search_cache_version,
  (SELECT COUNT(*) FROM file_chunks) AS file_chunks,
  (SELECT COUNT(*) FROM file_metadata) AS file_metadata,
  (SELECT COUNT(*) FROM file_processing_chunks) AS file_processing_chunks,
  (SELECT COUNT(*) FROM file_retry_usage) AS file_retry_usage,
  (SELECT COUNT(*) FROM graph_dirty_entities) AS graph_dirty_entities,
  (SELECT COUNT(*) FROM graph_dirty_relationships) AS graph_dirty_relationships,
  (SELECT COUNT(*) FROM graph_rebuild_job_dedupe) AS graph_rebuild_job_dedupe,
  (SELECT COUNT(*) FROM graphrag_telemetry) AS graphrag_telemetry,
  (SELECT COUNT(*) FROM library_entity_candidates) AS library_entity_candidates,
  (SELECT COUNT(*) FROM library_entity_discovery) AS library_entity_discovery,
  (SELECT COUNT(*) FROM library_entity_relationships) AS library_entity_relationships,
  (SELECT COUNT(*) FROM llm_usage_log) AS llm_usage_log,
  (SELECT COUNT(*) FROM message_history) AS message_history,
  (SELECT COUNT(*) FROM campaign_player_character_claims) AS campaign_player_character_claims,
  (SELECT COUNT(*) FROM planning_tasks) AS planning_tasks,
  (SELECT COUNT(*) FROM rebuild_status) AS rebuild_status,
  (SELECT COUNT(*) FROM resource_add_log) AS resource_add_log,
  (SELECT COUNT(*) FROM session_digest_templates) AS session_digest_templates,
  (SELECT COUNT(*) FROM session_digests) AS session_digests,
  (SELECT COUNT(*) FROM shard_registry) AS shard_registry,
  (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
  (SELECT COUNT(*) FROM sync_queue) AS sync_queue,
  (SELECT COUNT(*) FROM user_free_tier_usage) AS user_free_tier_usage,
  (SELECT COUNT(*) FROM user_indexing_credits) AS user_indexing_credits,
  (SELECT COUNT(*) FROM user_monthly_usage) AS user_monthly_usage,
  (SELECT COUNT(*) FROM user_openai_keys) AS user_openai_keys,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM world_state_changelog) AS world_state_changelog;
