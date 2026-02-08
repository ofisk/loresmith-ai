export type PlanningTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "superseded";

export interface PlanningTask {
  id: string;
  campaignId: string;
  title: string;
  description: string | null;
  status: PlanningTaskStatus;
  sourceMessageId?: string | null;
  linkedShardId?: string | null;
  /** Summary of how the user completed this step (saved when marked complete). */
  completionNotes?: string | null;
  /** Next upcoming session this step is for (e.g. 3 if session 2 was played). */
  targetSessionNumber?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Shared status group used by UI and tools for "open" planning tasks
export const OPEN_PLANNING_TASK_STATUSES: PlanningTaskStatus[] = [
  "pending",
  "in_progress",
];
