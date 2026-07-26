-- Player-facing recap emails between sessions (issue #745).
--
-- Four tables:
--   campaign_recap_settings      per-campaign opt-in (absent row == disabled)
--   campaign_recap_emails        one reviewable draft per session digest
--   campaign_recap_deliveries    per-recipient delivery record for one send
--   campaign_recap_subscriptions per-player unsubscribe state + stable token

-- Opt-in is per campaign and defaults off. A missing row means "not enabled",
-- so existing campaigns are never opted in by the migration itself.
CREATE TABLE IF NOT EXISTS campaign_recap_settings (
  campaign_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- A recap email is always a draft first. status moves draft -> sent (or failed),
-- and never back: a sent recap cannot be edited or re-sent.
CREATE TABLE IF NOT EXISTS campaign_recap_emails (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  digest_id TEXT NOT NULL,
  session_number INTEGER NOT NULL,
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  next_session_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  created_by TEXT NOT NULL,
  sent_by TEXT,
  sent_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- One recap per digest: regenerating replaces the existing draft rather than
-- creating a second one the GM could send twice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recap_emails_digest
  ON campaign_recap_emails(digest_id);

CREATE INDEX IF NOT EXISTS idx_campaign_recap_emails_campaign
  ON campaign_recap_emails(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_recap_deliveries (
  id TEXT PRIMARY KEY,
  recap_id TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (recap_id) REFERENCES campaign_recap_emails(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_campaign_recap_deliveries_recap
  ON campaign_recap_deliveries(recap_id);

-- One row per (campaign, player) once they have been mailed at least once.
-- unsubscribed_at NULL means subscribed; the token is stable so that older
-- emails keep working after a resubscribe.
CREATE TABLE IF NOT EXISTS campaign_recap_subscriptions (
  campaign_id TEXT NOT NULL,
  username TEXT NOT NULL,
  unsubscribe_token TEXT NOT NULL,
  unsubscribed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, username),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_recap_subscriptions_token
  ON campaign_recap_subscriptions(unsubscribe_token);
