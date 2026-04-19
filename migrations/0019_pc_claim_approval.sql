-- Optional GM approval for self-service PC claims; claim workflow status
-- Idempotent: bootstrap may already include pc_claim_requires_gm_approval; claim_status is new.
-- Rebuild with explicit constraints (see migration 0018).

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS campaign_player_character_claims__m19_bak;
CREATE TABLE campaign_player_character_claims__m19_bak AS SELECT * FROM campaign_player_character_claims;

DROP TABLE campaign_player_character_claims;

CREATE TABLE campaign_player_character_claims (
  campaign_id TEXT NOT NULL,
  username TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  claim_status TEXT NOT NULL DEFAULT 'approved',
  PRIMARY KEY (campaign_id, username),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

INSERT INTO campaign_player_character_claims (
  campaign_id,
  username,
  entity_id,
  assigned_by,
  created_at,
  updated_at,
  claim_status
)
SELECT
  campaign_id,
  username,
  entity_id,
  assigned_by,
  created_at,
  updated_at,
  'approved'
FROM campaign_player_character_claims__m19_bak;

DROP TABLE campaign_player_character_claims__m19_bak;

DROP TABLE IF EXISTS campaigns__m19_bak;
CREATE TABLE campaigns__m19_bak AS SELECT * FROM campaigns;

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
  game_system,
  game_system_version,
  COALESCE(pc_claim_requires_gm_approval, 0),
  created_at,
  updated_at
FROM campaigns__m19_bak;

DROP TABLE campaigns__m19_bak;

PRAGMA foreign_keys=ON;

CREATE INDEX IF NOT EXISTS idx_campaigns_username ON campaigns(username);
CREATE INDEX IF NOT EXISTS idx_campaigns_username_updated ON campaigns(username, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_claims_campaign_entity
  ON campaign_player_character_claims(campaign_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_pc_claims_campaign_username
  ON campaign_player_character_claims(campaign_id, username);
