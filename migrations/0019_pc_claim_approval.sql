-- Optional GM approval for self-service PC claims; claim workflow status
ALTER TABLE campaigns ADD COLUMN pc_claim_requires_gm_approval INTEGER NOT NULL DEFAULT 0;

ALTER TABLE campaign_player_character_claims ADD COLUMN claim_status TEXT NOT NULL DEFAULT 'approved';
