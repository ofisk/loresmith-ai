-- GM approval for self-service PC claims: claim_status on claims rows.
-- Non-destructive: campaign columns (game_system, pc_claim_requires_gm_approval, etc.) come from 0018.
-- No DROP/rebuild of campaigns or campaign_player_character_claims.

ALTER TABLE campaign_player_character_claims ADD COLUMN claim_status TEXT NOT NULL DEFAULT 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pc_claims_campaign_entity
  ON campaign_player_character_claims(campaign_id, entity_id);

CREATE INDEX IF NOT EXISTS idx_pc_claims_campaign_username
  ON campaign_player_character_claims(campaign_id, username);
