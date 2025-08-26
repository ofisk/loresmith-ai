-- Migration: Add AutoRAG job tracking
-- This table tracks AutoRAG job IDs and their associated files for reliable status updates

CREATE TABLE IF NOT EXISTS autorag_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL UNIQUE,
    rag_id TEXT NOT NULL,
    username TEXT NOT NULL,
    file_key TEXT NOT NULL,
    file_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    error_message TEXT
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_username ON autorag_jobs(username);
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_job_id ON autorag_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_file_key ON autorag_jobs(file_key);
CREATE INDEX IF NOT EXISTS idx_autorag_jobs_status ON autorag_jobs(status);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_autorag_jobs_timestamp 
    AFTER UPDATE ON autorag_jobs
    FOR EACH ROW
BEGIN
    UPDATE autorag_jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
