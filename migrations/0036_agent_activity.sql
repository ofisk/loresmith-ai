-- Append-only record of agent actions (issue #739).
--
-- Five stalled issues — #273 (agent dashboard), #276 (autonomy levels), #277
-- (interrupt controls), #279 (guided flows), #281 (multi-agent visualization) —
-- each need the same thing and none of them had it: a durable, queryable trace
-- of what an agent did. Tool results flow back through `streamText` into the
-- response stream and are then gone; the only surviving evidence that a tool
-- ran was the chat transcript and whatever the tool itself wrote.
--
-- Rows are written from `BaseAgent.createEnhancedTools`, the one wrapper every
-- agent's every tool call already passes through, so agents get this with no
-- per-agent instrumentation.
CREATE TABLE IF NOT EXISTS agent_activity (
  id TEXT PRIMARY KEY,

  -- Who acted, and on whose behalf. `username` is denormalized from the JWT
  -- rather than joined through the session, because every read of this table is
  -- scoped to one user and a dashboard cannot afford a join to prove ownership.
  username TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  -- Null for actions outside any campaign (library uploads, auth, help).
  campaign_id TEXT,
  -- The Durable Object id of the conversation, i.e. one chat thread.
  session_id TEXT NOT NULL,

  -- 'tool_call' | 'delegation'. Deliberately coarser than the tool name so a
  -- future non-tool action (a generation step, an indexing pass) has somewhere
  -- to land without a migration.
  action_type TEXT NOT NULL,
  tool_name TEXT,

  -- 'running' | 'succeeded' | 'failed' | 'cancelled' | 'awaiting_approval'.
  -- The last two are unused by this change and exist because #277 and #276 are
  -- a status value plus a check, not a schema change, once they are here.
  status TEXT NOT NULL,

  -- Parent/child linkage. `parent_id` is the delegating action for work a
  -- delegate did on another agent's behalf; `root_id` is the top of that tree
  -- and is set even on roots (to their own id) so one indexed equality fetches
  -- a whole multi-agent turn without a recursive query.
  parent_id TEXT,
  root_id TEXT NOT NULL,

  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  -- Measured in the Worker rather than derived from the two timestamps: D1
  -- stores these at second resolution, and most tool calls finish inside one.
  duration_ms INTEGER,

  -- JSON. Redacted, size-capped view of the arguments and of what the call
  -- touched (entity ids, file keys, campaign ids). Never the raw tool input:
  -- the wrapper injects the caller's JWT into args before execute, so a
  -- verbatim copy would persist credentials. See summarizeToolInput().
  summary TEXT,
  -- Failure message, already truncated. Null on success.
  error TEXT
);

-- The dashboard's primary read: this user's recent activity, newest first.
CREATE INDEX IF NOT EXISTS idx_agent_activity_user_started
  ON agent_activity(username, started_at DESC);

-- Per-campaign feed (#273) and per-agent attribution badges (#281).
CREATE INDEX IF NOT EXISTS idx_agent_activity_campaign_started
  ON agent_activity(campaign_id, started_at DESC);

-- "What is this conversation doing right now" — the live view for one thread.
CREATE INDEX IF NOT EXISTS idx_agent_activity_session_started
  ON agent_activity(session_id, started_at DESC);

-- Fetch a whole delegation tree in one query.
CREATE INDEX IF NOT EXISTS idx_agent_activity_root
  ON agent_activity(root_id);

-- The retention sweep deletes by age across all users, so it needs started_at
-- as a leading column on its own — the composite indexes above cannot serve it.
CREATE INDEX IF NOT EXISTS idx_agent_activity_started_at
  ON agent_activity(started_at);
