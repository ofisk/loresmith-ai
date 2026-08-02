-- Content-addressed cache for expensive LLM results (issue #761, finding 8)
--
-- `CommunitySummaryService.generateOrGetSummary` already checks for an existing
-- result before calling a model. Nothing else did, so re-uploading the same PDF
-- or re-running a rebuild over unchanged chunks re-paid full extraction cost on
-- Sonnet 5 every time.
--
-- `cache_key` is a SHA-256 hex digest over (namespace version, kind, model,
-- rendered prompt prefix, per-call content). Hashing the *rendered prompt*
-- rather than a hand-maintained version constant means an instruction edit and
-- a content edit invalidate by the same mechanism — there is no version number
-- for a future author to forget to bump.
--
-- The stored `payload` is deliberately the *validated, campaign-independent*
-- model output, captured before entity IDs are minted and scoped to a campaign.
-- That is what makes the same document uploaded to a second campaign a cache
-- hit rather than a second full extraction.
--
-- There is no eviction beyond an age sweep on the fast cron. Rows are small
-- (a capped JSON payload) and a stale prompt's rows are already unreachable —
-- their key can never be derived again — so they cost storage, not correctness.
CREATE TABLE IF NOT EXISTS llm_result_cache (
  cache_key TEXT PRIMARY KEY,
  -- Which pipeline produced this, e.g. 'entity_extraction'. Also the unit the
  -- hit-rate log groups by.
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  -- JSON. Result of the call, as validated by the caller's schema.
  payload TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_hit_at DATETIME
);

-- The retention sweep on the fast cron deletes by age.
CREATE INDEX IF NOT EXISTS idx_llm_result_cache_created
  ON llm_result_cache(created_at);

-- Reporting what the cache saved, and dropping a superseded model's rows after
-- a tier change, both scan by these two columns.
CREATE INDEX IF NOT EXISTS idx_llm_result_cache_kind_model
  ON llm_result_cache(kind, model);
