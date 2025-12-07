import { getDAOFactory } from "@/dao/dao-factory";
import type { PlanningContextSearchOptions } from "@/services/rag/planning-context-service";
import {
  type ContextWithAuth,
  getUserAuth,
  ensureCampaignAccess,
  getPlanningContextService,
} from "@/lib/route-utils";

export async function handleSearchPlanningContext(c: ContextWithAuth) {
  try {
    console.log("[PlanningContext] Search endpoint called");
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    console.log(`[PlanningContext] Searching campaign: ${campaignId}`);

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      console.log(
        `[PlanningContext] Access denied for campaign: ${campaignId}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as {
      query: string;
      limit?: number;
      fromDate?: string;
      toDate?: string;
      sectionTypes?: string[];
      applyRecencyWeighting?: boolean;
      decayRate?: number;
    };

    if (!body.query || typeof body.query !== "string") {
      console.log("[PlanningContext] Invalid query parameter");
      return c.json({ error: "query is required and must be a string" }, 400);
    }

    console.log(
      `[PlanningContext] Starting search with query: "${body.query.substring(0, 100)}"`
    );
    const service = getPlanningContextService(c);
    const searchOptions: PlanningContextSearchOptions = {
      campaignId,
      query: body.query,
      limit: body.limit,
      fromDate: body.fromDate,
      toDate: body.toDate,
      sectionTypes: body.sectionTypes,
      applyRecencyWeighting:
        body.applyRecencyWeighting !== undefined
          ? body.applyRecencyWeighting
          : true,
      decayRate: body.decayRate,
    };

    const results = await service.search(searchOptions);
    console.log(
      `[PlanningContext] Search completed, returning ${results.length} results`
    );

    return c.json({ results });
  } catch (error) {
    console.error("[PlanningContext] Failed to search:", error);
    return c.json(
      { error: "Failed to search planning context" },
      error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
    );
  }
}

export async function handleGetRecentPlanningContext(c: ContextWithAuth) {
  try {
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      return c.json({ error: "Campaign not found" }, 404);
    }

    const limit = c.req.query("limit")
      ? Number(c.req.query("limit"))
      : undefined;

    const daoFactory = getDAOFactory(c.env);
    const digests = await daoFactory.sessionDigestDAO.getRecentSessionDigests(
      campaignId,
      limit || 10
    );

    return c.json({ digests });
  } catch (error) {
    console.error("[PlanningContext] Failed to get recent digests:", error);
    return c.json({ error: "Failed to get recent planning context" }, 500);
  }
}
