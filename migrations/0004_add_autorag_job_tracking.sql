-- Migration: Add AutoRAG job tracking
-- This table tracks AutoRAG job IDs and their associated files for reliable status updates

create table if not exists autorag_jobs (
    id integer primary key autoincrement,
    job_id text not null unique,
    rag_id text not null,
    username text not null,
    file_key text not null,
    file_name text not null,
    status text default 'pending',
    created_at datetime default current_timestamp,
    updated_at datetime default current_timestamp,
    completed_at datetime,
    error_message text
);

-- Index for efficient lookups
create index if not exists idx_autorag_jobs_username on autorag_jobs(username);
create index if not exists idx_autorag_jobs_job_id on autorag_jobs(job_id);
create index if not exists idx_autorag_jobs_file_key on autorag_jobs(file_key);
create index if not exists idx_autorag_jobs_status on autorag_jobs(status);

-- Add trigger to update updated_at timestamp
create trigger if not exists update_autorag_jobs_timestamp 
    after update on autorag_jobs
    for each row
begin
    update autorag_jobs set updated_at = current_timestamp where id = new.id;
end;
