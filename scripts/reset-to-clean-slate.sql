-- Reset database to clean slate
-- This script drops all tables and relies on clean_slate migration to recreate them

-- Drop all tables in dependency order to avoid foreign key constraint issues

DROP TABLE IF EXISTS graphrag_telemetry;
DROP TABLE IF EXISTS rebuild_status;
DROP TABLE IF EXISTS session_digests;
DROP TABLE IF EXISTS world_state_changelog;
DROP TABLE IF EXISTS community_summaries;
DROP TABLE IF EXISTS entity_importance;
DROP TABLE IF EXISTS communities;
DROP TABLE IF EXISTS entity_deduplication_pending;
DROP TABLE IF EXISTS entity_relationships;
DROP TABLE IF EXISTS entities;
DROP TABLE IF EXISTS shard_registry;
DROP TABLE IF EXISTS file_processing_chunks;
DROP TABLE IF EXISTS sync_queue;
DROP TABLE IF EXISTS file_chunks;
DROP TABLE IF EXISTS campaign_context_chunks;
DROP TABLE IF EXISTS character_sheets;
DROP TABLE IF EXISTS campaign_planning_sessions;
DROP TABLE IF EXISTS campaign_characters;
DROP TABLE IF EXISTS campaign_context;
DROP TABLE IF EXISTS campaign_resources;
DROP TABLE IF EXISTS file_metadata;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS user_openai_keys;
DROP TABLE IF EXISTS user_notifications;

-- Drop any FTS tables that might exist
DROP TABLE IF EXISTS file_metadata_fts;
DROP TABLE IF EXISTS file_metadata_fts_data;
DROP TABLE IF EXISTS file_metadata_fts_idx;
DROP TABLE IF EXISTS file_metadata_fts_content;
DROP TABLE IF EXISTS file_metadata_fts_docsize;
DROP TABLE IF EXISTS file_metadata_fts_config;

