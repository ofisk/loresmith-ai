-- Campaign-level game system for unified PC sheet validation
-- Idempotent: bootstrap may already include game_system / game_system_version. Rebuild
-- campaigns with explicit PRIMARY KEY (CREATE TABLE AS SELECT drops constraints).

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS campaigns__m18_bak;
CREATE TABLE campaigns__m18_bak AS SELECT * FROM campaigns;

DROP TABLE campaigns;

CREATE TABLE campaigns (
  id text primary key,
  username text not null,
  name text not null,
  description text,
  status text default 'active',
  metadata text,
  campaignRagBasePath text,
  game_system text not null default 'generic',
  game_system_version text,
  pc_claim_requires_gm_approval integer not null default 0,
  created_at datetime default current_timestamp,
  updated_at datetime default current_timestamp
);

INSERT INTO campaigns (
  id,
  username,
  name,
  description,
  status,
  metadata,
  campaignRagBasePath,
  game_system,
  game_system_version,
  pc_claim_requires_gm_approval,
  created_at,
  updated_at
)
SELECT
  id,
  username,
  name,
  description,
  status,
  metadata,
  campaignRagBasePath,
  COALESCE(game_system, 'generic'),
  game_system_version,
  pc_claim_requires_gm_approval,
  created_at,
  updated_at
FROM campaigns__m18_bak;

DROP TABLE campaigns__m18_bak;

PRAGMA foreign_keys=ON;

CREATE INDEX IF NOT EXISTS idx_campaigns_username ON campaigns(username);
CREATE INDEX IF NOT EXISTS idx_campaigns_username_updated ON campaigns(username, updated_at DESC);

-- Normalize legacy player character entity types to canonical `pcs`
UPDATE entities SET entity_type = 'pcs' WHERE lower(entity_type) = 'pc';
