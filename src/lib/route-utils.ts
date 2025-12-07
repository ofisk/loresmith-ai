import type { Context } from "hono";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { getDAOFactory } from "@/dao/dao-factory";
import { PlanningContextService } from "@/services/rag/planning-context-service";
import { ContextAssemblyService } from "@/services/context/context-assembly-service";
import { RebuildQueueService } from "@/services/graph/rebuild-queue-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";

/**
 * Context type extended with authentication information
 */
export type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: AuthPayload;
};

/**
 * Extract user authentication from context
 * Throws UserAuthenticationMissingError if not present
 */
export function getUserAuth(c: ContextWithAuth): AuthPayload {
  // Try multiple ways to get userAuth to handle different context structures
  const userAuth =
    (c as any).userAuth ??
    (c as any).get?.("userAuth") ??
    (c as any).var?.userAuth;
  if (!userAuth) {
    throw new UserAuthenticationMissingError();
  }
  return userAuth;
}

/**
 * Verify that a user has access to a campaign
 * Returns true if the user owns or has access to the campaign
 * Uses getCampaignByIdWithMapping to check both ownership and mapping
 */
export async function ensureCampaignAccess(
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

/**
 * Verify campaign access and return campaign details
 * Returns null if campaign not found or user doesn't have access
 */
export async function verifyCampaignAccess(
  c: ContextWithAuth,
  campaignId: string,
  username: string
): Promise<{
  campaignId: string;
  name: string;
  campaignRagBasePath: string;
} | null> {
  const daoFactory = getDAOFactory(c.env);
  const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
    campaignId,
    username
  );

  if (!campaign) {
    return null;
  }

  return {
    campaignId: campaign.campaignId,
    name: campaign.name,
    campaignRagBasePath:
      campaign.campaignRagBasePath || `campaigns/${campaignId}`,
  };
}

/**
 * Get PlanningContextService instance
 * Validation happens automatically in PlanningContextService constructor
 */
export function getPlanningContextService(
  c: ContextWithAuth
): PlanningContextService {
  return new PlanningContextService(
    c.env.DB!,
    c.env.VECTORIZE!,
    c.env.OPENAI_API_KEY as string,
    c.env
  );
}

/**
 * Get ContextAssemblyService instance
 */
export function getContextAssemblyService(
  c: ContextWithAuth
): ContextAssemblyService {
  return new ContextAssemblyService(
    c.env.DB!,
    c.env.VECTORIZE!,
    c.env.OPENAI_API_KEY as string,
    c.env
  );
}

/**
 * Get RebuildQueueService instance
 * Throws error if GRAPH_REBUILD_QUEUE binding is not configured
 */
export function getRebuildQueueService(
  c: ContextWithAuth
): RebuildQueueService {
  if (!c.env.GRAPH_REBUILD_QUEUE) {
    throw new Error("GRAPH_REBUILD_QUEUE binding not configured");
  }
  return new RebuildQueueService(c.env.GRAPH_REBUILD_QUEUE);
}

/**
 * Get WorldStateChangelogService instance
 * Throws error if database binding is not configured
 */
export function getWorldStateChangelogService(
  c: ContextWithAuth
): WorldStateChangelogService {
  if (!c.env.DB) {
    throw new Error("Database not configured");
  }
  return new WorldStateChangelogService({ db: c.env.DB });
}
