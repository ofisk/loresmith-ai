import { useMemo, useState } from "react";
import { USER_MESSAGES } from "@/app-constants";
import { API_CONFIG } from "@/shared-config";
import type { PlanningTask, PlanningTaskStatus } from "@/types/planning-task";
import { useAuthenticatedRequest } from "@/hooks/useAuthenticatedRequest";
import { useBaseAsync } from "@/hooks/useBaseAsync";

export function usePlanningTasks() {
  const [tasks, setTasks] = useState<PlanningTask[]>([]);
  const [nextSessionNumber, setNextSessionNumber] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const { makeRequestWithData } = useAuthenticatedRequest();

  const fetchPlanningTasks = useBaseAsync(
    useMemo(
      () =>
        async (
          campaignId: string,
          options?: { statuses?: PlanningTaskStatus[] }
        ) => {
          const query =
            options?.statuses && options.statuses.length > 0
              ? `?status=${options.statuses.join(",")}`
              : "";

          const data = await makeRequestWithData<{
            tasks: PlanningTask[];
            nextSessionNumber?: number;
          }>(
            API_CONFIG.buildUrl(
              `${API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.BASE(
                campaignId
              )}${query}`
            )
          );
          return {
            tasks: data.tasks || [],
            nextSessionNumber:
              typeof data.nextSessionNumber === "number" &&
              data.nextSessionNumber >= 1
                ? data.nextSessionNumber
                : 1,
          };
        },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (result: {
          tasks: PlanningTask[];
          nextSessionNumber: number;
        }) => {
          setTasks(result.tasks);
          setNextSessionNumber(result.nextSessionNumber);
        },
        onError: (err: string) => setError(err),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_FETCH_PLANNING_TASKS,
      }),
      []
    )
  );

  const createPlanningTask = useBaseAsync(
    useMemo(
      () =>
        async (
          campaignId: string,
          input: {
            title: string;
            description?: string | null;
            targetSessionNumber?: number | null;
          }
        ) => {
          const data = await makeRequestWithData<{ task: PlanningTask }>(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.BASE(campaignId)
            ),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(input),
            }
          );
          return data.task;
        },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (task: PlanningTask) => {
          setTasks((prev) => [task, ...prev]);
        },
        onError: (err: string) => setError(err),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_CREATE_PLANNING_TASK,
      }),
      []
    )
  );

  const updatePlanningTask = useBaseAsync(
    useMemo(
      () =>
        async (
          campaignId: string,
          taskId: string,
          input: Partial<{
            title: string;
            description: string | null;
            status: PlanningTaskStatus;
            targetSessionNumber: number | null;
          }>
        ) => {
          const data = await makeRequestWithData<{ task: PlanningTask }>(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.DETAILS(
                campaignId,
                taskId
              )
            ),
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(input),
            }
          );
          return data.task;
        },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (task: PlanningTask) => {
          setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
        },
        onError: (err: string) => setError(err),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_UPDATE_PLANNING_TASK,
      }),
      []
    )
  );

  const deletePlanningTask = useBaseAsync(
    useMemo(
      () => async (campaignId: string, taskId: string) => {
        await makeRequestWithData<{
          success: boolean;
        }>(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.DETAILS(
              campaignId,
              taskId
            )
          ),
          {
            method: "DELETE",
          }
        );
        return taskId;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (taskId: string) => {
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
        },
        onError: (err: string) => setError(err),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_DELETE_PLANNING_TASK,
      }),
      []
    )
  );

  const bulkCompletePlanningTasks = useBaseAsync(
    useMemo(
      () => async (campaignId: string, taskIds: string[]) => {
        await makeRequestWithData<{ success: boolean }>(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.PLANNING_TASKS.COMPLETE_BULK(
              campaignId
            )
          ),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ taskIds }),
          }
        );
        return taskIds;
      },
      [makeRequestWithData]
    ),
    useMemo(
      () => ({
        onSuccess: (taskIds: string[]) => {
          setTasks((prev) =>
            prev.map((t) =>
              taskIds.includes(t.id) ? { ...t, status: "completed" } : t
            )
          );
        },
        onError: (err: string) => setError(err),
        errorMessage: USER_MESSAGES.HOOK_FAILED_TO_UPDATE_PLANNING_TASK,
      }),
      []
    )
  );

  return {
    tasks,
    nextSessionNumber,
    error,
    fetchPlanningTasks,
    createPlanningTask,
    updatePlanningTask,
    deletePlanningTask,
    bulkCompletePlanningTasks,
  };
}
