-- Campaign continuity checker (issue #744)
--
-- continuity_findings stores GM-facing questions about likely contradictions
-- across session digests, world state changelog entries and the entity graph.
--
-- The UNIQUE(campaign_id, fingerprint) constraint is what makes "a dismissed
-- finding must never resurface" work: re-detection computes the same stable
-- fingerprint and the insert is skipped when a row already exists, regardless
-- of its status.
CREATE TABLE IF NOT EXISTS continuity_findings (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN (
    'state_contradiction',
    'timeline_contradiction',
    'relationship_contradiction',
    'rules_contradiction',
    'dangling_thread'
  )),
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  question TEXT NOT NULL,
  detail TEXT,
  evidence TEXT NOT NULL, -- JSON array of ContinuityEvidence (both sides, always)
  subject_entity_id TEXT,
  subject_name TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'confirmed',
    'dismissed',
    'corrected'
  )),
  resolution_note TEXT,
  resolved_by TEXT,
  resolved_at DATETIME,
  scan_id TEXT,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_continuity_findings_campaign_status
  ON continuity_findings(campaign_id, status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_continuity_findings_campaign_type
  ON continuity_findings(campaign_id, finding_type);

CREATE INDEX IF NOT EXISTS idx_continuity_findings_scan
  ON continuity_findings(scan_id);

-- Watermark for incremental scans. A scan only treats digests newer than
-- last_scanned_session as the "later reference" side of a contradiction, so
-- routine ingest-time checks stay O(new sessions) rather than O(campaign).
CREATE TABLE IF NOT EXISTS continuity_scan_state (
  campaign_id TEXT PRIMARY KEY,
  last_scanned_session INTEGER,
  last_scan_id TEXT,
  last_scan_mode TEXT,
  last_scan_at DATETIME,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);
