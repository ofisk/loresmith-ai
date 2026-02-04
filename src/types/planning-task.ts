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
  createdAt: string;
  updatedAt: string;
}

// Shared status group used by UI and tools for "open" planning tasks
export const OPEN_PLANNING_TASK_STATUSES: PlanningTaskStatus[] = [
  "pending",
  "in_progress",
];
