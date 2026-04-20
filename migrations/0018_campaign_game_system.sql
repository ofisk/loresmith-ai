-- Campaign-level game system for unified PC sheet validation
-- Non-destructive: only ADD COLUMN on campaigns (no DROP/RECREATE). Preserves primary keys,
-- row identity, and all foreign keys pointing at campaigns.id throughout the migration.

-- Wrangler applies each file once. If a column already exists (manual schema drift), this
-- migration will error; fix the drift or align d1_migrations before re-running.

ALTER TABLE campaigns ADD COLUMN game_system TEXT NOT NULL DEFAULT 'generic';

ALTER TABLE campaigns ADD COLUMN game_system_version TEXT;

ALTER TABLE campaigns ADD COLUMN pc_claim_requires_gm_approval INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_campaigns_username ON campaigns(username);

CREATE INDEX IF NOT EXISTS idx_campaigns_username_updated ON campaigns(username, updated_at DESC);

-- Normalize legacy player character entity types to canonical `pcs`
UPDATE entities SET entity_type = 'pcs' WHERE lower(entity_type) = 'pc';
