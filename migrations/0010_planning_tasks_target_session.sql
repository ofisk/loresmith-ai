-- Tag planning tasks with the next upcoming session (session_number).
-- If session 2 has been played (recap given), next steps are for session 3.

ALTER TABLE planning_tasks ADD COLUMN target_session_number INTEGER;
