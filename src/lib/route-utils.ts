import type { Context } from "hono";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import type { CampaignMemberRole } from "@/dao/campaign-dao";
import { getDAOFactory } from "@/dao/dao-factory";
import { getEnvVar } from "@/lib/env-utils";
import {
	CampaignAccessDeniedError,
	UserAuthenticationMissingError,
} from "@/lib/errors";
import type { Env } from "@/middleware/auth";
import { ContextAssemblyService } from "@/services/context/context-assembly-service";
import type { AuthPayload } from "@/services/core/auth-service";
import { RebuildQueueService } from "@/services/graph/rebuild-queue-service";
import { WorldStateChangelogService } from "@/services/graph/world-state-changelog-service";
import { PlanningContextService } from "@/services/rag/planning-context-service";

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
 * Verify campaign access and return campaign details with role
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
	role: "owner" | CampaignMemberRole;
} | null> {
	const daoFactory = getDAOFactory(c.env);
	const campaign = await daoFactory.campaignDAO.getCampaignByIdWithMapping(
		campaignId,
		username
	);

	if (!campaign) {
		return null;
	}

	const role = await daoFactory.campaignDAO.getCampaignRole(
		campaignId,
		username
	);
	if (!role) return null;

	return {
		campaignId: campaign.campaignId,
		name: campaign.name,
		campaignRagBasePath:
			campaign.campaignRagBasePath || `campaigns/${campaignId}`,
		role,
	};
}

/**
 * Get the user's role in a campaign, or null if no access
 */
export async function getCampaignRole(
	c: ContextWithAuth,
	campaignId: string,
	username: string
): Promise<"owner" | CampaignMemberRole | null> {
	const daoFactory = getDAOFactory(c.env);
	return daoFactory.campaignDAO.getCampaignRole(campaignId, username);
}

/**
 * Require the user to have one of the allowed roles. Throws CampaignAccessDeniedError if not.
 */
export async function requireCampaignRole(
	c: ContextWithAuth,
	campaignId: string,
	allowedRoles: ("owner" | CampaignMemberRole)[]
): Promise<"owner" | CampaignMemberRole> {
	const role = await getCampaignRole(c, campaignId, getUserAuth(c).username);
	if (!role || !allowedRoles.includes(role)) {
		throw new CampaignAccessDeniedError();
	}
	return role;
}

/**
 * Require the user to be the campaign owner. Throws CampaignAccessDeniedError if not.
 */
export async function requireCampaignOwner(
	c: ContextWithAuth,
	campaignId: string
): Promise<void> {
	await requireCampaignRole(c, campaignId, [CAMPAIGN_ROLES.OWNER]);
}

/**
 * Require the user to be able to see spoilers (owner, editor_gm, readonly_gm)
 */
export async function requireCanSeeSpoilers(
	c: ContextWithAuth,
	campaignId: string
): Promise<"owner" | CampaignMemberRole> {
	return requireCampaignRole(c, campaignId, [
		CAMPAIGN_ROLES.OWNER,
		CAMPAIGN_ROLES.EDITOR_GM,
		CAMPAIGN_ROLES.READONLY_GM,
	]);
}

/**
 * Require the user to be able to edit (owner, editor_gm)
 */
export async function requireCanEdit(
	c: ContextWithAuth,
	campaignId: string
): Promise<"owner" | CampaignMemberRole> {
	return requireCampaignRole(c, campaignId, [
		CAMPAIGN_ROLES.OWNER,
		CAMPAIGN_ROLES.EDITOR_GM,
	]);
}

/**
 * Require the user to be able to approve shards (owner, editor_gm)
 */
export async function requireCanApproveShards(
	c: ContextWithAuth,
	campaignId: string
): Promise<"owner" | CampaignMemberRole> {
	return requireCampaignRole(c, campaignId, [
		CAMPAIGN_ROLES.OWNER,
		CAMPAIGN_ROLES.EDITOR_GM,
	]);
}

/**
 * Get PlanningContextService instance
 * Validation happens automatically in PlanningContextService constructor
 */
export async function getPlanningContextService(
	c: ContextWithAuth
): Promise<PlanningContextService> {
	const openaiApiKey = await getEnvVar(c.env, "OPENAI_API_KEY", false);
	return new PlanningContextService(
		c.env.DB!,
		c.env.VECTORIZE!,
		openaiApiKey,
		c.env
	);
}

/**
 * Get ContextAssemblyService instance
 */
export async function getContextAssemblyService(
	c: ContextWithAuth
): Promise<ContextAssemblyService> {
	const openaiApiKey = await getEnvVar(c.env, "OPENAI_API_KEY", false);
	return new ContextAssemblyService(
		c.env.DB!,
		c.env.VECTORIZE!,
		openaiApiKey,
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
