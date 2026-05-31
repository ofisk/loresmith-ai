import type { PlanningTaskStatus } from "@/dao/planning-task-dao";

type TaskWithSession = {
	targetSessionNumber?: number | null;
	status: PlanningTaskStatus;
};

/** Whether a task counts toward prep for the upcoming session (N+1 after last digest). */
export function taskMatchesUpcomingSession(
	task: TaskWithSession,
	nextSessionNumber: number
): boolean {
	const pinned = task.targetSessionNumber ?? null;
	if (pinned != null) {
		return pinned === nextSessionNumber;
	}
	// Legacy untagged open tasks are treated as prep for the current upcoming session.
	return task.status === "pending" || task.status === "in_progress";
}

/** Whether a task is explicitly pinned to a specific session number. */
export function taskMatchesSessionNumber(
	task: TaskWithSession,
	sessionNumber: number
): boolean {
	return (task.targetSessionNumber ?? null) === sessionNumber;
}

export function filterTasksForUpcomingSession<T extends TaskWithSession>(
	tasks: T[],
	nextSessionNumber: number
): T[] {
	return tasks.filter((t) => taskMatchesUpcomingSession(t, nextSessionNumber));
}

export function filterTasksForSessionNumber<T extends TaskWithSession>(
	tasks: T[],
	sessionNumber: number
): T[] {
	return tasks.filter((t) => taskMatchesSessionNumber(t, sessionNumber));
}

export type PlanningTaskStatusCounts = Record<PlanningTaskStatus, number>;

export function countTasksByStatus<T extends { status: PlanningTaskStatus }>(
	tasks: T[]
): PlanningTaskStatusCounts {
	const counts: PlanningTaskStatusCounts = {
		pending: 0,
		in_progress: 0,
		completed: 0,
		superseded: 0,
	};
	for (const task of tasks) {
		counts[task.status] += 1;
	}
	return counts;
}

export function groupTasksByTargetSession<T extends TaskWithSession>(
	tasks: T[]
): Map<number | null, T[]> {
	const groups = new Map<number | null, T[]>();
	for (const task of tasks) {
		const key = task.targetSessionNumber ?? null;
		const list = groups.get(key) ?? [];
		list.push(task);
		groups.set(key, list);
	}
	return groups;
}
