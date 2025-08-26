-- Clear all production data while preserving datastores
-- This script removes all data from all existing tables but keeps the table structure intact

-- Clear all data from all existing tables (in dependency order to avoid foreign key constraints)

-- Clear AutoRAG job tracking data
DELETE FROM autorag_jobs;

-- Clear AutoRAG chunks data
DELETE FROM autorag_chunks;

-- Clear campaign context chunks data
DELETE FROM campaign_context_chunks;

-- Clear campaign characters data
DELETE FROM campaign_characters;

-- Clear character sheets data
DELETE FROM character_sheets;

-- Clear campaign context data
DELETE FROM campaign_context;

-- Clear campaign resources data
DELETE FROM campaign_resources;

-- Clear file metadata data (this will also clear the FTS tables)
DELETE FROM file_metadata;

-- Clear campaigns data
DELETE FROM campaigns;

-- Clear user OpenAI keys data
DELETE FROM user_openai_keys;

-- Reset auto-increment counters for tables that use them
DELETE FROM sqlite_sequence WHERE name = 'autorag_jobs';

-- Note: This script preserves all table structures, indexes, and foreign key relationships
-- while removing all user data. The datastores (tables) themselves remain intact.
