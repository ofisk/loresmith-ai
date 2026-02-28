-- Player character claim mapping per campaign
-- Enforces one PC per player and one player per PC within a campaign
CREATE TABLE IF NOT EXISTS campaign_player_character_claims (
  campaign_id TEXT NOT NULL,
  username TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, username),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_claims_campaign_entity
  ON campaign_player_character_claims(campaign_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_pc_claims_campaign_username
  ON campaign_player_character_claims(campaign_id, username);
