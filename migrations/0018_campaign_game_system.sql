-- Campaign-level game system for unified PC sheet validation
ALTER TABLE campaigns ADD COLUMN game_system TEXT NOT NULL DEFAULT 'generic';
ALTER TABLE campaigns ADD COLUMN game_system_version TEXT;

-- Normalize legacy player character entity types to canonical `pcs`
UPDATE entities SET entity_type = 'pcs' WHERE lower(entity_type) = 'pc';
