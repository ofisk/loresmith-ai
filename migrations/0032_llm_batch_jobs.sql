-- Anthropic Message Batches API for queue-driven pipeline work (issue #735)
--
-- A batch is submitted in one worker invocation and collected in a later one
-- (Anthropic allows up to 24h, a Worker invocation does not), so the in-flight
-- batch has to outlive the request that created it. One row per submitted batch.
--
-- `owner_kind` + `owner_key` identify the pipeline job the batch belongs to
-- (currently 'library_entity_discovery' + file_key). The UNIQUE index on
-- (owner_kind, owner_key) over non-terminal rows is what makes submission
-- single-flight: a second cron tick cannot submit a duplicate batch for a job
-- that already has one in flight.
--
-- `requests` is a JSON array of {customId, chunkIndex} — the mapping needed to
-- put an out-of-order batch result back on the right chunk. Batch results are
-- keyed by custom_id and arrive in arbitrary order, never by position.
CREATE TABLE IF NOT EXISTS llm_batch_jobs (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_batch_id TEXT,
  owner_kind TEXT NOT NULL,
  owner_key TEXT NOT NULL,
  username TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'submitting',
    'in_progress',
    'collected',
    'failed',
    'expired',
    'canceled'
  )),
  request_count INTEGER NOT NULL DEFAULT 0,
  succeeded_count INTEGER NOT NULL DEFAULT 0,
  errored_count INTEGER NOT NULL DEFAULT 0,
  -- JSON array of {customId, chunkIndex}. Results are keyed by custom_id.
  requests TEXT NOT NULL,
  -- Guards against resuming a batch against different content: on collect, the
  -- caller re-derives this and falls back to inline extraction on mismatch.
  content_fingerprint TEXT,
  chunk_window_start INTEGER,
  chunk_window_end INTEGER,
  total_chunks INTEGER,
  -- Wall-clock deadline. Past it, the caller abandons the batch and falls back
  -- to the synchronous per-item path so indexing never wedges.
  deadline_at DATETIME NOT NULL,
  last_polled_at DATETIME,
  poll_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Single-flight per pipeline job: at most one non-terminal batch per owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_batch_jobs_owner_active
  ON llm_batch_jobs(owner_kind, owner_key)
  WHERE status IN ('submitting', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_status_created
  ON llm_batch_jobs(status, created_at);

-- Batch requests draw on a separate org budget line (batchRequestsPerMinute),
-- so the budget check sums request_count over a recent window.
CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_username_created
  ON llm_batch_jobs(username, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_batch_jobs_provider_batch_id
  ON llm_batch_jobs(provider_batch_id);
