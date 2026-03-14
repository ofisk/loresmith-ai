-- Store partial readout chunks during chunked session plan generation.
-- Chunks are cleared after stitchSessionReadout completes.
CREATE TABLE IF NOT EXISTS campaign_session_plan_readout_chunks (
  campaign_id TEXT NOT NULL,
  next_session_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  steps_json TEXT NOT NULL,
  created_at DATETIME DEFAULT current_timestamp,
  PRIMARY KEY (campaign_id, next_session_number, chunk_index),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
