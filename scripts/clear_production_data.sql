-- Clear all production data while preserving datastores
-- This script removes all data from all existing tables but keeps the table structure intact

-- Clear all data from all existing tables (in dependency order to avoid foreign key constraints)


-- Clear campaign context chunks data
delete from campaign_context_chunks;

-- Clear campaign characters data
delete from campaign_characters;

-- Clear character sheets data
delete from character_sheets;

-- Clear campaign context data
delete from campaign_context;

-- Clear campaign resources data
delete from campaign_resources;

-- Clear file metadata data (this will also clear the FTS tables)
delete from file_metadata;

-- Clear campaigns data
delete from campaigns;

-- Clear user OpenAI keys data
delete from user_openai_keys;


-- Note: This script preserves all table structures, indexes, and foreign key relationships
-- while removing all user data. The datastores (tables) themselves remain intact.
