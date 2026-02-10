import { Plus, Check, PencilSimple, Trash } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { usePlanningTasks } from "@/hooks/usePlanningTasks";
import type {
  PlanningTask,
  PlanningTaskStatus,
} from "../../types/planning-task";

interface PlanningTasksPanelProps {
  campaignId: string | null;
}

export function PlanningTasksPanel({ campaignId }: PlanningTasksPanelProps) {
  const {
    tasks,
    nextSessionNumber,
    error,
    fetchPlanningTasks,
    createPlanningTask,
    updatePlanningTask,
    deletePlanningTask,
  } = usePlanningTasks();
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingSession, setEditingSession] = useState<Record<string, string>>(
    {}
  );
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  useEffect(() => {
    if (!campaignId) return;
    void fetchPlanningTasks.execute(campaignId, {
      statuses: ["pending", "in_progress"] as PlanningTaskStatus[],
    });
  }, [campaignId, fetchPlanningTasks]);

  const handleAddTask = async () => {
    const title = newTitle.trim();
    if (!campaignId || !title) return;
    try {
      await createPlanningTask.execute(campaignId, {
        title,
        description: newDescription.trim() || null,
        targetSessionNumber: nextSessionNumber,
      });
      setNewTitle("");
      setNewDescription("");
      setIsAddingTask(false); // Collapse form after adding
    } catch {
      // Error is handled by hook-level error state
    }
  };

  const handleEditTask = async (_campaignId: string, task: PlanningTask) => {
    setEditingTaskId(task.id);
    setEditingTitle(task.title);
    setEditingDescription(task.description ?? "");
  };

  const handleSaveEdit = async (campaignId: string, taskId: string) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle) return;

    try {
      await updatePlanningTask.execute(campaignId, taskId, {
        title: trimmedTitle,
        description: editingDescription.trim() || null,
      });
      setEditingTaskId(null);
      setEditingTitle("");
      setEditingDescription("");
    } catch {
      // Error handled by hook
    }
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditingTitle("");
    setEditingDescription("");
  };

  const handleSessionNumberBlur = (
    campaignId: string,
    task: PlanningTask,
    value: string
  ) => {
    setEditingSession((prev) => {
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    const num = value.trim() === "" ? null : parseInt(value, 10);
    const resolved =
      num != null && Number.isInteger(num) && num >= 1 ? num : null;
    if (resolved === (task.targetSessionNumber ?? null)) return;
    void updatePlanningTask.execute(campaignId, task.id, {
      targetSessionNumber: resolved,
    });
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
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
            Next steps
          </h2>
          {tasks.length > 0 && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {tasks.length} open {tasks.length === 1 ? "task" : "tasks"}
            </span>
          )}
        </div>
        {!isAddingTask && (
          <button
            type="button"
            onClick={() => setIsAddingTask(true)}
            className="px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-xs"
          >
            <Plus size={14} />
            Add step
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Add new task - collapsible */}
      {isAddingTask && (
        <div className="mt-3 space-y-2 rounded-md border border-neutral-200/60 bg-neutral-50/40 p-3 dark:border-neutral-700/60 dark:bg-neutral-900/40">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add a planning task..."
            className="w-full rounded-md border border-neutral-200/60 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
          />
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="Optional details or notes"
            rows={2}
            className="w-full rounded-md border border-neutral-200/60 bg-white px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAddingTask(false);
                setNewTitle("");
                setNewDescription("");
              }}
              className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddTask}
              className="px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={!newTitle.trim()}
            >
              Add step
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="mt-3 space-y-2">
        {tasks.length === 0 ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No planning tasks yet. Use the help button or add your own tasks to
            track what you want to prepare next.
          </p>
        ) : (
          tasks.map((task) => {
            const isEditing = editingTaskId === task.id;

            return (
              <div
                key={task.id}
                className="flex items-start justify-between gap-2 rounded-md bg-neutral-50/60 px-2 py-1.5 text-xs dark:bg-neutral-900/70"
              >
                {isEditing ? (
                  // Edit mode
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      placeholder="Task title"
                      className="w-full rounded-md border border-neutral-200/60 bg-white px-2 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    />
                    <textarea
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      placeholder="Optional details or notes"
                      rows={2}
                      className="w-full rounded-md border border-neutral-200/60 bg-white px-2 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-blue-400 dark:focus:ring-blue-400"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="inline-flex items-center rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(campaignId, task.id)}
                        className="px-2 py-1.5 bg-neutral-200 dark:bg-neutral-700 text-purple-600 dark:text-purple-400 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors flex items-center justify-center gap-2 text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={!editingTitle.trim()}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-800 dark:text-neutral-100">
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        <span>Session</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-12 rounded border border-neutral-200/60 bg-white px-1 py-0.5 text-right text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                          value={
                            task.id in editingSession
                              ? editingSession[task.id]
                              : task.targetSessionNumber != null
                                ? String(task.targetSessionNumber)
                                : ""
                          }
                          placeholder={String(nextSessionNumber)}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "" || /^\d+$/.test(v))
                              setEditingSession((prev) => ({
                                ...prev,
                                [task.id]: v,
                              }));
                          }}
                          onBlur={(e) =>
                            handleSessionNumberBlur(
                              campaignId,
                              task,
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMarkComplete(campaignId, task.id)}
                        className="p-1.5 text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        title="Mark done"
                      >
                        <Check size={16} weight="bold" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditTask(campaignId, task)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        title="Edit"
                      >
                        <PencilSimple size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          deletePlanningTask.execute(campaignId, task.id)
                        }
                        className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
