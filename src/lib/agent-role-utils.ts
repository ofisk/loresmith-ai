/**
 * Helpers for resolving and using campaign role in the agent pipeline.
 */
import type { D1Database } from "@cloudflare/workers-types";
import type { CampaignRole } from "@/types/campaign";
import { getDAOFactory } from "@/dao/dao-factory";
import { AuthService } from "@/services/core/auth-service";

/**
 * Resolve the user's campaign role from env, campaignId, and JWT.
 * Returns null if campaignId or JWT is missing, or if the user has no access to the campaign.
 */
export async function resolveCampaignRole(
  env: { DB?: D1Database; [key: string]: unknown },
  campaignId: string | null,
  jwt: string | null
): Promise<CampaignRole | null> {
  if (!campaignId || !jwt) return null;
  const username = AuthService.parseJwtForUsername(jwt);
  if (!username) return null;
  const daoFactory = getDAOFactory(env);
  return daoFactory.campaignDAO.getCampaignRole(campaignId, username);
}
