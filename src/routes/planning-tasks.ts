import { getDAOFactory } from "@/dao/dao-factory";
import type { PlanningTaskStatus } from "@/dao/planning-task-dao";
import {
  type ContextWithAuth,
  ensureCampaignAccess,
  getUserAuth,
} from "@/lib/route-utils";

type UpdatePlanningTaskBody = {
  title?: string;
  description?: string | null;
  status?: PlanningTaskStatus;
  targetSessionNumber?: number | null;
};

// List planning tasks for a campaign (returns nextSessionNumber for tagging new tasks)
export async function handleGetPlanningTasks(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const planningTaskDAO = daoFactory.planningTaskDAO;
    const sessionDigestDAO = daoFactory.sessionDigestDAO;

    const statusParam = c.req.query("status");
    const statuses: PlanningTaskStatus[] | undefined = statusParam
      ? (statusParam.split(",").filter(Boolean) as PlanningTaskStatus[])
      : undefined;

    const tasks = await planningTaskDAO.listByCampaign(campaignId, {
      status: statuses,
    });

    const nextSessionNumber =
      await sessionDigestDAO.getNextSessionNumber(campaignId);

    return c.json({ tasks, nextSessionNumber });
  } catch (error) {
    console.error("[PlanningTasks] Failed to list tasks:", error);
    return c.json({ error: "Failed to list planning tasks" }, 500);
  }
}

// Create a new planning task for a campaign (user-managed task)
export async function handleCreatePlanningTask(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as {
      title?: unknown;
      description?: unknown;
      targetSessionNumber?: unknown;
    };

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "title is required" }, 400);
    }

    const description =
      typeof body.description === "string" ? body.description : null;
    const targetSessionNumber =
      typeof body.targetSessionNumber === "number" &&
      Number.isInteger(body.targetSessionNumber) &&
      body.targetSessionNumber >= 1
        ? body.targetSessionNumber
        : null;

    const daoFactory = getDAOFactory(c.env);
    const planningTaskDAO = daoFactory.planningTaskDAO;

    const task = await planningTaskDAO.createPlanningTask(campaignId, {
      title: body.title.trim(),
      description,
      targetSessionNumber,
    });

    return c.json({ task }, 201);
  } catch (error) {
    console.error("[PlanningTasks] Failed to create task:", error);
    return c.json({ error: "Failed to create planning task" }, 500);
  }
}

// Update a planning task (title/description/status)
export async function handleUpdatePlanningTask(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const taskId = c.req.param("taskId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as UpdatePlanningTaskBody;
    const daoFactory = getDAOFactory(c.env);
    const planningTaskDAO = daoFactory.planningTaskDAO;

    const updates: UpdatePlanningTaskBody = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length === 0) {
        return c.json({ error: "title must be a non-empty string" }, 400);
      }
      updates.title = body.title.trim();
    }

    if (body.description !== undefined) {
      updates.description =
        typeof body.description === "string" ? body.description : null;
    }

    if (body.status !== undefined) {
      const allowed: PlanningTaskStatus[] = [
        "pending",
        "in_progress",
        "completed",
        "superseded",
      ];
      if (!allowed.includes(body.status)) {
        return c.json({ error: "Invalid status value" }, 400);
      }
      updates.status = body.status;
    }

    if (body.targetSessionNumber !== undefined) {
      updates.targetSessionNumber =
        typeof body.targetSessionNumber === "number" &&
        Number.isInteger(body.targetSessionNumber) &&
        body.targetSessionNumber >= 1
          ? body.targetSessionNumber
          : null;
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    // If only status is changing (no title/description/targetSessionNumber), use updateStatus; otherwise updateTask
    if (
      updates.status !== undefined &&
      updates.title === undefined &&
      updates.description === undefined &&
      updates.targetSessionNumber === undefined
    ) {
      await planningTaskDAO.updateStatus(taskId, updates.status);
    } else {
      await planningTaskDAO.updateTask(taskId, campaignId, updates);
    }

    const updated = await planningTaskDAO.getById(taskId);

    if (updated.campaignId !== campaignId) {
      return c.json(
        { error: "Planning task does not belong to this campaign" },
        404
      );
    }

    return c.json({ task: updated });
  } catch (error) {
    console.error("[PlanningTasks] Failed to update task:", error);
    return c.json({ error: "Failed to update planning task" }, 500);
  }
}

// Delete a planning task
export async function handleDeletePlanningTask(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const taskId = c.req.param("taskId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const planningTaskDAO = daoFactory.planningTaskDAO;

    const task = await planningTaskDAO.getById(taskId);
    if (task.campaignId !== campaignId) {
      return c.json(
        { error: "Planning task does not belong to this campaign" },
        404
      );
    }

    await planningTaskDAO.deleteTask(taskId);

    return c.json({ success: true });
  } catch (error) {
    console.error("[PlanningTasks] Failed to delete task:", error);
    return c.json({ error: "Failed to delete planning task" }, 500);
  }
}

// Bulk mark tasks as completed (used by session digest flow)
export async function handleBulkCompletePlanningTasks(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as { taskIds?: unknown };
    if (!Array.isArray(body.taskIds) || body.taskIds.length === 0) {
      return c.json({ error: "taskIds must be a non-empty array" }, 400);
    }

    const taskIds = body.taskIds.filter(
      (id): id is string => typeof id === "string"
    );

    if (taskIds.length === 0) {
      return c.json({ error: "taskIds must contain string ids" }, 400);
    }

    const daoFactory = getDAOFactory(c.env);
    const planningTaskDAO = daoFactory.planningTaskDAO;

    for (const id of taskIds) {
      const task = await planningTaskDAO.getById(id);
      if (task.campaignId === campaignId) {
        await planningTaskDAO.updateStatus(id, "completed");
      }
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("[PlanningTasks] Failed to bulk-complete tasks:", error);
    return c.json({ error: "Failed to complete planning tasks" }, 500);
  }
}
