import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { RebuildQueueService } from "@/services/graph/rebuild-queue-service";
import type { RebuildType } from "@/dao/rebuild-status-dao";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

function getUserAuth(c: ContextWithAuth): AuthPayload {
  const userAuth = (c as any).userAuth;
  if (!userAuth) {
    throw new UserAuthenticationMissingError();
  }
  return userAuth;
}

async function ensureCampaignAccess(
  c: ContextWithAuth,
  campaignId: string,
  username: string
): Promise<boolean> {
  const daoFactory = getDAOFactory(c.env);
  const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
    campaignId,
    username
  );
  return Boolean(campaign);
}

function getRebuildQueueService(c: ContextWithAuth): RebuildQueueService {
  if (!c.env.GRAPH_REBUILD_QUEUE) {
    throw new Error("GRAPH_REBUILD_QUEUE binding not configured");
  }
  return new RebuildQueueService(c.env.GRAPH_REBUILD_QUEUE);
}

/**
 * POST /api/campaigns/:campaignId/graph-rebuild/trigger
 * Trigger a graph rebuild for a campaign
 */
export async function handleTriggerRebuild(c: ContextWithAuth) {
  try {
    console.log("[GraphRebuild] Trigger rebuild endpoint called");
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    if (!campaignId) {
      return c.json({ error: "Campaign ID is required" }, 400);
    }

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      console.log(`[GraphRebuild] Access denied for campaign: ${campaignId}`);
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json().catch(() => ({}))) as {
      rebuildType?: RebuildType;
      affectedEntityIds?: string[];
      forceFull?: boolean;
    };

    const rebuildType: RebuildType =
      body.forceFull || !body.affectedEntityIds?.length
        ? "full"
        : body.rebuildType || "partial";

    const affectedEntityIds =
      rebuildType === "partial" ? body.affectedEntityIds || [] : [];

    // Create rebuild status entry first
    const daoFactory = getDAOFactory(c.env);
    const rebuildId = crypto.randomUUID();
    await daoFactory.rebuildStatusDAO.createRebuild({
      id: rebuildId,
      campaignId,
      rebuildType,
      status: "pending",
      affectedEntityIds,
    });

    // Enqueue rebuild job
    const queueService = getRebuildQueueService(c);
    await queueService.enqueueRebuild({
      rebuildId,
      campaignId,
      rebuildType,
      affectedEntityIds,
      triggeredBy: auth.username,
      options: {
        regenerateSummaries: true,
        recalculateImportance: true,
      },
    });

    console.log(
      `[GraphRebuild] Rebuild ${rebuildId} enqueued for campaign: ${campaignId}`
    );

    return c.json({
      rebuildId,
      campaignId,
      rebuildType,
      status: "pending",
      message: `Rebuild ${rebuildId} has been queued for processing`,
    });
  } catch (error) {
    console.error("[GraphRebuild] Failed to trigger rebuild:", error);
    return c.json(
      { error: "Failed to trigger rebuild" },
      error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
    );
  }
}

/**
 * GET /api/campaigns/:campaignId/graph-rebuild/status/:rebuildId
 * Get the status of a specific rebuild
 */
export async function handleGetRebuildStatus(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const rebuildId = c.req.param("rebuildId");

    if (!campaignId || !rebuildId) {
      return c.json({ error: "Campaign ID and Rebuild ID are required" }, 400);
    }

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const rebuildStatus =
      await daoFactory.rebuildStatusDAO.getRebuildById(rebuildId);

    if (!rebuildStatus) {
      return c.json({ error: "Rebuild not found" }, 404);
    }

    // Verify rebuild belongs to the campaign
    if (rebuildStatus.campaignId !== campaignId) {
      return c.json({ error: "Rebuild not found for this campaign" }, 404);
    }

    return c.json({ rebuildStatus });
  } catch (error) {
    console.error("[GraphRebuild] Failed to get rebuild status:", error);
    return c.json({ error: "Failed to get rebuild status" }, 500);
  }
}

/**
 * GET /api/campaigns/:campaignId/graph-rebuild/history
 * Get rebuild history for a campaign
 */
export async function handleGetRebuildHistory(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    if (!campaignId) {
      return c.json({ error: "Campaign ID is required" }, 400);
    }

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const query = c.req.query();
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    const status = query.status as any;

    const daoFactory = getDAOFactory(c.env);
    const rebuildHistory = await daoFactory.rebuildStatusDAO.getRebuildHistory(
      campaignId,
      {
        status,
        limit,
        offset,
      }
    );

    return c.json({
      rebuilds: rebuildHistory,
      pagination: {
        limit,
        offset,
        total: rebuildHistory.length,
      },
    });
  } catch (error) {
    console.error("[GraphRebuild] Failed to get rebuild history:", error);
    return c.json({ error: "Failed to get rebuild history" }, 500);
  }
}

/**
 * POST /api/campaigns/:campaignId/graph-rebuild/cancel/:rebuildId
 * Cancel a pending or in-progress rebuild
 */
export async function handleCancelRebuild(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const rebuildId = c.req.param("rebuildId");

    if (!campaignId || !rebuildId) {
      return c.json({ error: "Campaign ID and Rebuild ID are required" }, 400);
    }

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const rebuildStatus =
      await daoFactory.rebuildStatusDAO.getRebuildById(rebuildId);

    if (!rebuildStatus) {
      return c.json({ error: "Rebuild not found" }, 404);
    }

    // Verify rebuild belongs to the campaign
    if (rebuildStatus.campaignId !== campaignId) {
      return c.json({ error: "Rebuild not found for this campaign" }, 404);
    }

    // Only allow cancelling pending or in_progress rebuilds
    if (
      rebuildStatus.status !== "pending" &&
      rebuildStatus.status !== "in_progress"
    ) {
      return c.json(
        {
          error: `Cannot cancel rebuild with status: ${rebuildStatus.status}`,
        },
        400
      );
    }

    await daoFactory.rebuildStatusDAO.cancelRebuild(rebuildId);

    console.log(
      `[GraphRebuild] Rebuild ${rebuildId} cancelled for campaign: ${campaignId}`
    );

    return c.json({
      rebuildId,
      status: "cancelled",
      message: "Rebuild has been cancelled",
    });
  } catch (error) {
    console.error("[GraphRebuild] Failed to cancel rebuild:", error);
    return c.json({ error: "Failed to cancel rebuild" }, 500);
  }
}

/**
 * GET /api/campaigns/:campaignId/graph-rebuild/active
 * Get active rebuilds for a campaign
 */
export async function handleGetActiveRebuilds(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");

    if (!campaignId) {
      return c.json({ error: "Campaign ID is required" }, 400);
    }

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const daoFactory = getDAOFactory(c.env);
    const activeRebuilds =
      await daoFactory.rebuildStatusDAO.getActiveRebuilds(campaignId);

    return c.json({ rebuilds: activeRebuilds });
  } catch (error) {
    console.error("[GraphRebuild] Failed to get active rebuilds:", error);
    return c.json({ error: "Failed to get active rebuilds" }, 500);
  }
}
