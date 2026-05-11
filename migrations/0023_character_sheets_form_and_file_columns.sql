-- character_sheets: hosted databases already include character_class, file_name, etc.
-- (added outside this migration track). Applying ALTER ADD here fails with duplicate column.
-- DAO changes populate character_data on insert for legacy NOT NULL rows.
-- Fresh installs: use scripts/d1/d1-bootstrap.sql (character_sheets includes full column set).
-- Older DBs missing columns: add them manually once to match CharacterSheetDAO.
SELECT 1 AS migration_0023_character_sheets_schema_aligned;
