-- GraphRAG Telemetry table for tracking query latency, changelog growth, rebuild metrics, and quality metrics.
-- See issue #222 for full specification.

CREATE TABLE IF NOT EXISTS graphrag_telemetry (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  metric_type TEXT NOT NULL,
  metric_value REAL NOT NULL,
  metadata TEXT, -- JSON metadata for additional context
  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_telemetry_campaign ON graphrag_telemetry(campaign_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_type ON graphrag_telemetry(metric_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_date ON graphrag_telemetry(recorded_at);

