-- Per-agent / per-intent cost attribution (issue #738).
--
-- Deliberately separate from `llm_usage_log`: that table is the rate-limiting
-- ledger and is pruned every 25 hours, so it cannot answer "which feature spent
-- the money last month". This table carries the attribution dimensions (#678
-- intents, agent, model role, surface) plus a priced cost, and is pruned on a
-- much longer horizon.
CREATE TABLE IF NOT EXISTS llm_cost_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  -- Subscription tier at time of spend, so cost-to-serve per tier stays correct
  -- even after a user upgrades or downgrades.
  tier TEXT,
  -- Controlled vocabulary from src/lib/llm-usage-intents.ts
  intent TEXT NOT NULL,
  -- Call site, e.g. "base_agent:onChatMessage"
  source TEXT,
  -- Agent class name when the spend happened inside an agent
  agent TEXT,
  model TEXT,
  provider TEXT,
  -- TextGenerationTier (PRIMARY / ANALYSIS / PIPELINE_*) when the call site
  -- resolved its model through getGenerationModelForProvider.
  model_role TEXT,
  -- 'interactive' (user is blocked on it) or 'pipeline' (background indexing)
  surface TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  query_count INTEGER NOT NULL DEFAULT 1,
  -- USD. 0 when the model has no known rate; `priced` distinguishes
  -- "cost nothing" from "we could not price it".
  cost_usd REAL NOT NULL DEFAULT 0,
  priced INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_llm_cost_events_time
  ON llm_cost_events(created_at);

CREATE INDEX IF NOT EXISTS idx_llm_cost_events_user_time
  ON llm_cost_events(username, created_at);

CREATE INDEX IF NOT EXISTS idx_llm_cost_events_intent_time
  ON llm_cost_events(intent, created_at);
