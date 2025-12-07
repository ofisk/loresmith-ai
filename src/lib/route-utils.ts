import type { Context } from "hono";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { UserAuthenticationMissingError } from "@/lib/errors";
import { getDAOFactory } from "@/dao/dao-factory";

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
