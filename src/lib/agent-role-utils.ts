/**
 * Helpers for resolving and using campaign role in the agent pipeline.
 */
import type { D1Database } from "@cloudflare/workers-types";
import { PLAYER_ROLES } from "@/constants/campaign-roles";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Entity } from "@/dao/entity-dao";
import type { PlayerCharacterClaim } from "@/dao/player-character-claim-dao";
import { AuthService } from "@/services/core/auth-service";
import type { CampaignRole } from "@/types/campaign";

export interface ResolvedClaimedPlayerContext {
	username: string;
	role: CampaignRole;
	claim: PlayerCharacterClaim | null;
	entity: Entity | null;
	hasAnyPcEntities: boolean;
}

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

/**
 * Resolve player-aware campaign context from env, campaignId, and JWT.
 * For player roles, this includes claimed player-character and entity context.
 * For non-player roles, claim/entity are null.
 */
export async function resolveClaimedPlayerContext(
	env: { DB?: D1Database; [key: string]: unknown },
	campaignId: string | null,
	jwt: string | null
): Promise<ResolvedClaimedPlayerContext | null> {
	if (!campaignId || !jwt) return null;

	const username = AuthService.parseJwtForUsername(jwt);
	if (!username) return null;

	const daoFactory = getDAOFactory(env);
	const role = await daoFactory.campaignDAO.getCampaignRole(
		campaignId,
		username
	);
	if (!role) return null;

	if (!PLAYER_ROLES.has(role)) {
		return {
			username,
			role,
			claim: null,
			entity: null,
			hasAnyPcEntities: false,
		};
	}

	const pcCount = await daoFactory.entityDAO.getEntityCountByCampaign(
		campaignId,
		{
			entityType: "pc",
		}
	);
	const pcsCount = await daoFactory.entityDAO.getEntityCountByCampaign(
		campaignId,
		{
			entityType: "pcs",
		}
	);
	const hasAnyPcEntities = pcCount + pcsCount > 0;

	const claim = await daoFactory.playerCharacterClaimDAO.getClaimForUser(
		campaignId,
		username
	);
	if (!claim) {
		return {
			username,
			role,
			claim: null,
			entity: null,
			hasAnyPcEntities,
		};
	}

	const entity = await daoFactory.entityDAO.getEntityById(claim.entityId);
	return {
		username,
		role,
		claim,
		entity,
		hasAnyPcEntities,
	};
}
