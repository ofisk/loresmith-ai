-- Library-scoped entity discovery: one LLM extraction per file_key, copied into campaigns on add.

CREATE TABLE IF NOT EXISTS library_entity_discovery (
  file_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  content_fingerprint TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  queue_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (file_key) REFERENCES file_metadata(file_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_library_entity_discovery_status ON library_entity_discovery(status);
CREATE INDEX IF NOT EXISTS idx_library_entity_discovery_username ON library_entity_discovery(username);

CREATE TABLE IF NOT EXISTS library_entity_candidates (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  username TEXT NOT NULL,
  merge_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT,
  metadata TEXT,
  confidence REAL,
  extraction_entity_id TEXT NOT NULL,
  id_suffix TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (file_key) REFERENCES file_metadata(file_key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_entity_candidates_file_merge
  ON library_entity_candidates(file_key, merge_key);

CREATE INDEX IF NOT EXISTS idx_library_entity_candidates_file_key ON library_entity_candidates(file_key);

CREATE TABLE IF NOT EXISTS library_entity_relationships (
  id TEXT PRIMARY KEY,
  file_key TEXT NOT NULL,
  from_extraction_entity_id TEXT NOT NULL,
  to_extraction_entity_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  strength REAL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (file_key) REFERENCES file_metadata(file_key) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_library_entity_rel_file_endpoints
  ON library_entity_relationships(file_key, from_extraction_entity_id, to_extraction_entity_id, relationship_type);

CREATE INDEX IF NOT EXISTS idx_library_entity_rel_file_key ON library_entity_relationships(file_key);
