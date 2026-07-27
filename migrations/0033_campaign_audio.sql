-- Generated campaign audio: scene ambience, campaign theme music, and
-- creature/NPC vocalizations (issue #756).
--
-- The blob lives in R2 and only its key is stored here, matching the split in
-- docs/STORAGE_STRATEGY.md. Rows are written in `pending` before generation
-- starts, so a slow or failed provider call leaves a visible, explainable record
-- rather than nothing at all.
CREATE TABLE IF NOT EXISTS campaign_audio (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  -- ambience | music | creature | voice. Selects the provider, because Workers AI
  -- can serve the speech kinds today and cannot serve sound/music at all.
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  -- The prompt actually sent to the provider, stored verbatim so the GM can see
  -- which campaign context produced a track and regeneration is reproducible.
  prompt TEXT NOT NULL,
  -- R2 object key; NULL until generation succeeds.
  r2_key TEXT,
  content_type TEXT,
  duration_sec REAL,
  size_bytes INTEGER,
  provider TEXT,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  loopable INTEGER NOT NULL DEFAULT 0,
  -- Where the prompt came from, so a track can be surfaced next to its scene on
  -- the session runsheet. JSON conforming to AudioSourceRef.
  source_kind TEXT,
  source_id TEXT,
  source_label TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT current_timestamp,
  updated_at DATETIME NOT NULL DEFAULT current_timestamp,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Listing is always scoped to a campaign, newest first.
CREATE INDEX IF NOT EXISTS idx_campaign_audio_campaign_created
  ON campaign_audio(campaign_id, created_at DESC);

-- The runsheet and the player both filter a campaign's tracks by kind.
CREATE INDEX IF NOT EXISTS idx_campaign_audio_campaign_kind
  ON campaign_audio(campaign_id, kind);

-- Attaching tracks to a runsheet scene looks up by source.
CREATE INDEX IF NOT EXISTS idx_campaign_audio_source
  ON campaign_audio(campaign_id, source_kind, source_id);
