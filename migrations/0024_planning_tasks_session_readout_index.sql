-- Session plan readout loads completed tasks scoped by campaign + session.
CREATE INDEX IF NOT EXISTS idx_planning_tasks_campaign_status_session
  ON planning_tasks(campaign_id, status, target_session_number);
