import type { Context } from "hono";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { ContextAssemblyService } from "@/services/context/context-assembly-service";
import type { ContextAssemblyOptions } from "@/types/context-assembly";

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

function getContextAssemblyService(c: ContextWithAuth): ContextAssemblyService {
  return new ContextAssemblyService(
    c.env.DB!,
    c.env.VECTORIZE!,
    c.env.OPENAI_API_KEY as string,
    c.env
  );
}

export async function handleAssembleContext(c: ContextWithAuth) {
  try {
    console.log("[ContextAssembly] Assemble context endpoint called");
    const auth = getUserAuth(c);
    const campaignId = c.req.param("campaignId");
    console.log(
      `[ContextAssembly] Assembling context for campaign: ${campaignId}`
    );

    const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
    if (!hasAccess) {
      console.log(
        `[ContextAssembly] Access denied for campaign: ${campaignId}`
      );
      return c.json({ error: "Campaign not found" }, 404);
    }

    const body = (await c.req.json()) as {
      query: string;
      options?: ContextAssemblyOptions;
    };

    if (!body.query || typeof body.query !== "string") {
      console.log("[ContextAssembly] Invalid query parameter");
      return c.json({ error: "query is required and must be a string" }, 400);
    }

    console.log(
      `[ContextAssembly] Starting context assembly with query: "${body.query.substring(0, 100)}"`
    );
    const service = getContextAssemblyService(c);
    const options: ContextAssemblyOptions = body.options || {};

    const context = await service.assembleContext(
      body.query,
      campaignId,
      options
    );

    console.log(
      `[ContextAssembly] Context assembly completed in ${context.metadata.totalAssemblyTime}ms (cached: ${context.metadata.cached})`
    );

    return c.json({
      context,
      cached: context.metadata.cached,
      performance: {
        graphRAGQueryTime: context.metadata.graphRAGQueryTime,
        changelogOverlayTime: context.metadata.changelogOverlayTime,
        planningContextTime: context.metadata.planningContextTime,
        totalAssemblyTime: context.metadata.totalAssemblyTime,
      },
    });
  } catch (error) {
    console.error("[ContextAssembly] Failed to assemble context:", error);
    return c.json(
      { error: "Failed to assemble context" },
      error instanceof Error && /required|must/i.test(error.message) ? 400 : 500
    );
  }
}
