import { describe, expect, it } from "vitest";
import type { PlanningTaskStatus } from "@/dao/planning-task-dao";
import {
	countTasksByStatus,
	filterTasksForSessionNumber,
	filterTasksForUpcomingSession,
	groupTasksByTargetSession,
	taskMatchesUpcomingSession,
} from "@/lib/planning-task-session";

type Task = {
	targetSessionNumber: number | null;
	status: PlanningTaskStatus;
	title?: string;
};

describe("planning-task-session", () => {
	it("matches tasks pinned to upcoming session", () => {
		expect(
			taskMatchesUpcomingSession(
				{ targetSessionNumber: 8, status: "pending" },
				8
			)
		).toBe(true);
		expect(
			taskMatchesUpcomingSession(
				{ targetSessionNumber: 7, status: "pending" },
				8
			)
		).toBe(false);
	});

	it("treats legacy untagged open tasks as upcoming session prep", () => {
		expect(
			taskMatchesUpcomingSession(
				{ targetSessionNumber: null, status: "pending" },
				8
			)
		).toBe(true);
		expect(
			taskMatchesUpcomingSession(
				{ targetSessionNumber: null, status: "completed" },
				8
			)
		).toBe(false);
	});

	it("filters and counts scoped tasks", () => {
		const tasks: Task[] = [
			{ targetSessionNumber: 8, status: "pending", title: "a" },
			{ targetSessionNumber: 7, status: "completed", title: "b" },
			{ targetSessionNumber: null, status: "in_progress", title: "c" },
			{ targetSessionNumber: 8, status: "completed", title: "d" },
		];

		const upcoming = filterTasksForUpcomingSession(tasks, 8);
		expect(upcoming.map((t) => t.title)).toEqual(["a", "c", "d"]);

		const session7 = filterTasksForSessionNumber(tasks, 7);
		expect(session7.map((t) => t.title)).toEqual(["b"]);

		const counts = countTasksByStatus(upcoming);
		expect(counts.pending).toBe(1);
		expect(counts.in_progress).toBe(1);
		expect(counts.completed).toBe(1);
	});

	it("groups completed tasks by target session", () => {
		const tasks: Task[] = [
			{ targetSessionNumber: 6, status: "completed" },
			{ targetSessionNumber: 7, status: "completed" },
			{ targetSessionNumber: 7, status: "completed" },
		];
		const groups = groupTasksByTargetSession(tasks);
		expect(groups.get(6)?.length).toBe(1);
		expect(groups.get(7)?.length).toBe(2);
	});
});
