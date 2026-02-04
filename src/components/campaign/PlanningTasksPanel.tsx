import { useEffect, useState } from "react";
import { usePlanningTasks } from "@/hooks/usePlanningTasks";
import type { PlanningTask } from "../../types/planning-task";
import { OPEN_PLANNING_TASK_STATUSES } from "../../types/planning-task";

interface PlanningTasksPanelProps {
  campaignId: string | null;
}

export function PlanningTasksPanel({ campaignId }: PlanningTasksPanelProps) {
  const {
    tasks,
    error,
    fetchPlanningTasks,
    createPlanningTask,
    updatePlanningTask,
    deletePlanningTask,
  } = usePlanningTasks();
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => {
    if (!campaignId) return;
    void fetchPlanningTasks.execute(campaignId, {
      statuses: OPEN_PLANNING_TASK_STATUSES,
    });
  }, [campaignId, fetchPlanningTasks]);

  const handleAddTask = async () => {
    const title = newTitle.trim();
    if (!campaignId || !title) return;
    try {
      await createPlanningTask.execute(campaignId, {
        title,
        description: newDescription.trim() || null,
      });
      setNewTitle("");
      setNewDescription("");
    } catch {
      // Error is handled by hook-level error state
    }
  };

  const handleEditTask = async (campaignId: string, task: PlanningTask) => {
    const nextTitle = window.prompt("Edit task title", task.title);
    if (nextTitle == null) return;
    const trimmedTitle = nextTitle.trim();
    if (!trimmedTitle) return;

    const nextDescription = window.prompt(
      "Edit task description (optional)",
      task.description ?? ""
    );

    try {
      await updatePlanningTask.execute(campaignId, task.id, {
        title: trimmedTitle,
        description:
          nextDescription !== null
            ? nextDescription.trim() || null
            : task.description,
      });
    } catch {
      // Error handled by hook
    }
  };

  const handleMarkComplete = async (campaignId: string, taskId: string) => {
    try {
      await updatePlanningTask.execute(campaignId, taskId, {
        status: "completed",
      });
    } catch {
      // Error handled by hook
    }
  };

  if (!campaignId) {
    return null;
  }

  return (
    <div className="mb-4 rounded-lg border border-neutral-200/60 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-700/60 dark:bg-neutral-900/80">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          Next steps
        </h2>
        {tasks.length > 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {tasks.length} open {tasks.length === 1 ? "task" : "tasks"}
          </p>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Add new task */}
      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a planning task..."
          className="w-full rounded-md border border-neutral-200/60 bg-neutral-50/60 px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-neutral-700/70 dark:bg-neutral-900/70 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <textarea
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="Optional details or notes"
          rows={2}
          className="w-full rounded-md border border-neutral-200/60 bg-neutral-50/60 px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-neutral-700/70 dark:bg-neutral-900/70 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleAddTask}
            className="inline-flex items-center rounded-md bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!newTitle.trim()}
          >
            Add task
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="mt-3 space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No planning tasks yet. Use the help button or add your own tasks to
            track what you want to prepare next.
          </p>
        ) : (
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-start justify-between gap-2 rounded-md bg-neutral-50/60 px-2 py-1.5 text-xs dark:bg-neutral-900/70"
            >
              <div className="flex-1">
                <p className="font-medium text-neutral-800 dark:text-neutral-100">
                  {task.title}
                </p>
                {task.description && (
                  <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                    {task.description}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => handleMarkComplete(campaignId, task.id)}
                  className="rounded-full border border-emerald-500 px-2 py-0.5 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/10"
                >
                  Mark done
                </button>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => handleEditTask(campaignId, task)}
                    className="rounded-full px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:bg-neutral-800/70"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      deletePlanningTask.execute(campaignId, task.id)
                    }
                    className="rounded-full px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-500/10"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
