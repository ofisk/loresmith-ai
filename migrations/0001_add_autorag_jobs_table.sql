-- Add AutoRAG job tracking table
CREATE TABLE IF NOT EXISTS autorag_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE,
  rag_id TEXT NOT NULL,
  username TEXT NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_job_id ON autorag_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_username ON autorag_jobs(username);
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_status ON autorag_jobs(status);
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_file_key ON autorag_jobs(file_key);
