-- Add completion_notes to planning_tasks so the agent can store how the user completed each step.
-- Used when recapping completed next steps and when combining planning tasks into a session plan.

ALTER TABLE planning_tasks ADD COLUMN completion_notes TEXT;
