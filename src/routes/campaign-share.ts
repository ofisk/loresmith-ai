import type { Context } from "hono";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import { NOTIFICATION_TYPES } from "@/constants/notification-types";
import type { CampaignMemberRole } from "@/dao/campaign-share-link-dao";
import { type DAOFactory, getDAOFactory } from "@/dao/dao-factory";
import { publicPcSheetSummary } from "@/lib/campaign/game-systems/validate-pc-content";
import { getRequestLogger } from "@/lib/logger";
import { nanoid } from "@/lib/nanoid";
import { notifyPartyRosterUpdated, notifyUser } from "@/lib/notifications";
import {
	ensureCampaignAccess,
	getCampaignRole,
	getUserAuth,
	requireCanEdit,
	requireParam,
} from "@/lib/route-utils";
import type { Env } from "@/middleware/auth";
import type { AuthPayload } from "@/services/core/auth-service";
import { ALLOWED_RETURN_ORIGINS, DEFAULT_APP_ORIGIN } from "@/shared-config";

type ContextWithAuth = Context<{ Bindings: Env }> & {
	userAuth?: AuthPayload;
};

function isPlayerRole(role: "owner" | CampaignMemberRole | null): boolean {
	return (
		role === CAMPAIGN_ROLES.EDITOR_PLAYER ||
		role === CAMPAIGN_ROLES.READONLY_PLAYER
	);
}

async function hasAnyPcEntities(
	daoFactory: DAOFactory,
	campaignId: string
): Promise<boolean> {
	const [pcCount, pcsCount] = await Promise.all([
		daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
			entityType: "pc",
		}),
		daoFactory.entityDAO.getEntityCountByCampaign(campaignId, {
			entityType: "pcs",
		}),
	]);
	return pcCount + pcsCount > 0;
}

async function getCampaignManagerUsernames(
	daoFactory: DAOFactory,
	campaignId: string
): Promise<string[]> {
	const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
	if (!campaign) return [];
	const memberUsernames =
		await daoFactory.campaignDAO.getCampaignMemberUsernames(campaignId);
	const managerSet = new Set<string>([campaign.username]);
	await Promise.all(
		memberUsernames.map(async (username) => {
			if (username === campaign.username) return;
			const role = await daoFactory.campaignDAO.getCampaignRole(
				campaignId,
				username
			);
			if (role === CAMPAIGN_ROLES.EDITOR_GM) {
				managerSet.add(username);
			}
		})
	);
	return Array.from(managerSet);
}

/** POST /campaigns/:campaignId/share-links - create share link (owner, editor_gm) */
export async function handleCreateShareLink(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const userAuth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const body = (await c.req.json()) as {
			role: CampaignMemberRole;
			expiresAt?: string | null;
			maxUses?: number | null;
		};

		if (!body.role) {
			return c.json({ error: "role is required" }, 400);
		}

		await requireCanEdit(c, campaignId);

		const token = nanoid(24);
		const daoFactory = getDAOFactory(c.env);
		await daoFactory.campaignShareLinkDAO.createShareLink(
			token,
			campaignId,
			body.role,
			userAuth.username,
			body.expiresAt ? new Date(body.expiresAt) : null,
			body.maxUses ?? null
		);

		// Prefer request Origin when valid (correct link for current app domain), else env
		const env = c.env as { APP_ORIGIN?: string; PRODUCTION_URL?: string };
		const requestOrigin = c.req.header("Origin")?.replace(/\/$/, "");
		const baseUrl =
			requestOrigin && ALLOWED_RETURN_ORIGINS.includes(requestOrigin)
				? requestOrigin
				: (env.APP_ORIGIN ?? env.PRODUCTION_URL ?? DEFAULT_APP_ORIGIN).replace(
						/\/$/,
						""
					);
		const url = `${baseUrl}/join?token=${token}`;

		return c.json(
			{
				token,
				url,
				expiresAt: body.expiresAt ?? null,
				maxUses: body.maxUses ?? null,
			},
			201
		);
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "CampaignAccessDeniedError"
		) {
			return c.json(
				{
					error:
						"You do not have permission to create share links for this campaign",
				},
				403
			);
		}
		log.error("[handleCreateShareLink] Failed to create share link", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/:campaignId/share-links - list active links (owner, editor_gm) */
export async function handleListShareLinks(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		await requireCanEdit(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const links =
			await daoFactory.campaignShareLinkDAO.listShareLinks(campaignId);

		return c.json({
			links: links.map((l) => ({
				token: l.token,
				role: l.role,
				createdBy: l.created_by,
				expiresAt: l.expires_at,
				maxUses: l.max_uses,
				useCount: l.use_count,
				createdAt: l.created_at,
			})),
		});
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "CampaignAccessDeniedError"
		) {
			return c.json(
				{
					error:
						"You do not have permission to list share links for this campaign",
				},
				403
			);
		}
		log.error("[handleListShareLinks] Failed to list share links", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** DELETE /campaigns/:campaignId/share-links/:token - revoke link */
export async function handleRevokeShareLink(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const token = requireParam(c, "token");
		if (token instanceof Response) return token;
		await requireCanEdit(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const link = await daoFactory.campaignShareLinkDAO.getShareLink(token);
		if (!link || link.campaign_id !== campaignId) {
			return c.json({ error: "Share link not found" }, 404);
		}

		await daoFactory.campaignShareLinkDAO.revokeShareLink(token);
		return c.json({ success: true });
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "CampaignAccessDeniedError"
		) {
			return c.json(
				{
					error:
						"You do not have permission to revoke share links for this campaign",
				},
				403
			);
		}
		log.error("[handleRevokeShareLink] Failed to revoke share link", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/join?token=... - redeem share link (can be unauthenticated; redirects to login if needed) */
export async function handleCampaignJoin(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const token = c.req.query("token");
		if (!token) {
			return c.json({ error: "token is required" }, 400);
		}

		const daoFactory = getDAOFactory(c.env);
		const link = await daoFactory.campaignShareLinkDAO.getShareLink(token);
		if (!link) {
			return c.json({ error: "Invalid or expired link" }, 404);
		}

		// Check expiry
		if (link.expires_at && new Date(link.expires_at) < new Date()) {
			return c.json({ error: "Link has expired" }, 410);
		}

		// Check max uses
		if (link.max_uses !== null && link.use_count >= link.max_uses) {
			return c.json({ error: "Link has reached maximum uses" }, 410);
		}

		// If not authenticated, return 401 with redirect hint
		const userAuth = (c as any).userAuth;
		if (!userAuth) {
			const campaign = await daoFactory.campaignDAO.getCampaignById(
				link.campaign_id
			);
			return c.json(
				{
					error: "Authentication required",
					redirectToLogin: true,
					campaignId: link.campaign_id,
					campaignName: campaign?.name,
					role: link.role,
				},
				401
			);
		}

		// Redeem the link
		const result = await daoFactory.campaignShareLinkDAO.redeemShareLink(
			token,
			userAuth.username
		);
		if (!result) {
			return c.json({ error: "Invalid or expired link" }, 404);
		}

		// Add user as campaign member
		await daoFactory.campaignDAO.addCampaignMember(
			result.campaignId,
			userAuth.username,
			result.role,
			link.created_by
		);

		const campaign = await daoFactory.campaignDAO.getCampaignById(
			result.campaignId
		);
		try {
			const managerUsernames = await getCampaignManagerUsernames(
				daoFactory,
				result.campaignId
			);
			const recipients = managerUsernames.filter(
				(username) => username !== userAuth.username
			);
			if (recipients.length > 0) {
				const campaignName = campaign?.name ?? "Campaign";
				const roleLabel = result.role.replace(/_/g, " ");
				await Promise.all(
					recipients.map((username) =>
						notifyUser(c.env, username, {
							type: NOTIFICATION_TYPES.SUCCESS,
							title: "Campaign member joined",
							message: `${userAuth.username} joined ${campaignName} as ${roleLabel}.`,
							data: {
								campaignId: result.campaignId,
								campaignName,
								joinedUsername: userAuth.username,
								joinedRole: result.role,
							},
						})
					)
				);
			}
		} catch (_notificationError) {}

		const isPlayer = isPlayerRole(result.role);
		const [claim, hasCampaignPcEntities] = isPlayer
			? await Promise.all([
					daoFactory.playerCharacterClaimDAO.getClaimForUser(
						result.campaignId,
						userAuth.username
					),
					hasAnyPcEntities(daoFactory, result.campaignId),
				])
			: [null, false];
		const requiresCharacterSelection =
			isPlayer &&
			!claim &&
			result.role === CAMPAIGN_ROLES.EDITOR_PLAYER &&
			hasCampaignPcEntities;

		return c.json({
			success: true,
			campaignId: result.campaignId,
			campaignName: campaign?.name,
			role: result.role,
			requiresCharacterSelection,
			playerCharacterClaim: claim,
			url: `/campaigns/${result.campaignId}`,
		});
	} catch (error) {
		log.error("[handleCampaignJoin] Failed to claim share link", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/:campaignId/player-character-claim/options - list unclaimed PCs for player onboarding */
export async function handleGetPlayerCharacterClaimOptions(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const role = await getCampaignRole(c, campaignId, auth.username);
		if (!isPlayerRole(role)) {
			return c.json(
				{
					error:
						"Player character selection is only available for player roles",
				},
				403
			);
		}

		const daoFactory = getDAOFactory(c.env);
		const [options, currentClaim, hasCampaignPcEntities] = await Promise.all([
			daoFactory.playerCharacterClaimDAO.listUnclaimedPcEntities(campaignId),
			daoFactory.playerCharacterClaimDAO.getClaimForUser(
				campaignId,
				auth.username
			),
			hasAnyPcEntities(daoFactory, campaignId),
		]);

		const currentClaimEntity = currentClaim
			? await daoFactory.entityDAO.getEntityById(currentClaim.entityId)
			: null;

		return c.json({
			options,
			currentClaim:
				currentClaim && currentClaimEntity
					? {
							...currentClaim,
							entityName: currentClaimEntity.name,
						}
					: null,
			requiresCharacterSelection:
				!currentClaim &&
				role === CAMPAIGN_ROLES.EDITOR_PLAYER &&
				hasCampaignPcEntities,
		});
	} catch (error) {
		log.error(
			"[handleGetPlayerCharacterClaimOptions] Failed to get options",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** POST /campaigns/:campaignId/player-character-claim - self-claim a PC entity */
export async function handleCreatePlayerCharacterClaim(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const role = await getCampaignRole(c, campaignId, auth.username);
		if (!isPlayerRole(role)) {
			return c.json(
				{ error: "Only players can create a self character claim" },
				403
			);
		}

		const body = (await c.req.json()) as { entityId?: string };
		if (!body.entityId) {
			return c.json({ error: "entityId is required" }, 400);
		}

		const daoFactory = getDAOFactory(c.env);
		const campaignRow =
			await daoFactory.campaignDAO.getCampaignById(campaignId);
		const requireApproval =
			(campaignRow?.pc_claim_requires_gm_approval ?? 0) === 1;
		const claimStatus = requireApproval ? "pending" : "approved";

		await daoFactory.playerCharacterClaimDAO.upsertClaim(
			campaignId,
			auth.username,
			body.entityId,
			auth.username,
			{ claimStatus }
		);

		const claim = await daoFactory.playerCharacterClaimDAO.getClaimForUser(
			campaignId,
			auth.username
		);

		if (campaignRow) {
			if (claimStatus === "pending") {
				const managers = await getCampaignManagerUsernames(
					daoFactory,
					campaignId
				);
				void Promise.allSettled(
					managers
						.filter((u) => u !== auth.username)
						.map((u) =>
							notifyUser(c.env, u, {
								type: NOTIFICATION_TYPES.PARTY_ROSTER_UPDATED,
								title: "Player character claim pending",
								message: `${auth.username} requested to claim a player character in "${campaignRow.name}".`,
								data: {
									campaignId,
									campaignName: campaignRow.name,
								},
							})
						)
				);
			} else {
				void notifyPartyRosterUpdated(
					c.env,
					campaignId,
					campaignRow.name,
					`${auth.username} claimed a player character.`,
					[auth.username]
				);
			}
		}

		return c.json({ success: true, claim });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		if (message.includes("UNIQUE constraint failed")) {
			return c.json({ error: "That character is already claimed" }, 409);
		}
		if (
			message.includes("not found") ||
			message.includes("must be a player character")
		) {
			return c.json({ error: message }, 400);
		}
		log.error(
			"[handleCreatePlayerCharacterClaim] Failed to create claim",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/:campaignId/player-character-claims - list all campaign claims (owner/editor_gm) */
export async function handleListPlayerCharacterClaims(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		await requireCanEdit(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const [claims, unclaimedOptions] = await Promise.all([
			daoFactory.playerCharacterClaimDAO.listClaimsForCampaign(campaignId),
			daoFactory.playerCharacterClaimDAO.listUnclaimedPcEntities(campaignId),
		]);

		const entityIds = claims.map((claim) => claim.entityId);
		const entities =
			entityIds.length > 0
				? await daoFactory.entityDAO.getEntitiesByIds(entityIds)
				: [];
		const entityNameById = new Map(
			entities.map((entity) => [entity.id, entity.name])
		);

		return c.json({
			claims: claims.map((claim) => ({
				...claim,
				entityName: entityNameById.get(claim.entityId) ?? claim.entityId,
			})),
			unclaimedOptions,
			requestedBy: auth.username,
		});
	} catch (error) {
		log.error("[handleListPlayerCharacterClaims] Failed to list claims", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** PUT /campaigns/:campaignId/player-character-claims/:username - assign/reassign a player's claimed PC (owner/editor_gm) */
export async function handleAssignPlayerCharacterClaim(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const targetUsername = requireParam(c, "username");
		if (targetUsername instanceof Response) return targetUsername;
		await requireCanEdit(c, campaignId);

		const body = (await c.req.json()) as { entityId?: string };
		if (!body.entityId) {
			return c.json({ error: "entityId is required" }, 400);
		}

		const targetRole = await getCampaignRole(c, campaignId, targetUsername);
		if (!isPlayerRole(targetRole)) {
			return c.json(
				{
					error:
						"Character claims can only be assigned to users with player roles",
				},
				400
			);
		}

		const daoFactory = getDAOFactory(c.env);
		await daoFactory.playerCharacterClaimDAO.upsertClaim(
			campaignId,
			targetUsername,
			body.entityId,
			auth.username,
			{ claimStatus: "approved" }
		);

		const claim = await daoFactory.playerCharacterClaimDAO.getClaimForUser(
			campaignId,
			targetUsername
		);

		const campaignRow =
			await daoFactory.campaignDAO.getCampaignById(campaignId);
		if (campaignRow) {
			void notifyPartyRosterUpdated(
				c.env,
				campaignId,
				campaignRow.name,
				`${auth.username} assigned a player character to ${targetUsername}.`,
				[auth.username]
			);
		}

		return c.json({ success: true, claim });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		if (message.includes("UNIQUE constraint failed")) {
			return c.json({ error: "That character is already claimed" }, 409);
		}
		if (
			message.includes("not found") ||
			message.includes("must be a player character")
		) {
			return c.json({ error: message }, 400);
		}
		log.error(
			"[handleAssignPlayerCharacterClaim] Failed to assign claim",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** DELETE /campaigns/:campaignId/player-character-claims/:username - clear a player's claimed PC (owner/editor_gm) */
export async function handleClearPlayerCharacterClaim(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const targetUsername = requireParam(c, "username");
		if (targetUsername instanceof Response) return targetUsername;
		await requireCanEdit(c, campaignId);

		const targetRole = await getCampaignRole(c, campaignId, targetUsername);
		if (!isPlayerRole(targetRole)) {
			return c.json(
				{
					error:
						"Character claims can only be managed for users with player roles",
				},
				400
			);
		}

		const daoFactory = getDAOFactory(c.env);
		await daoFactory.playerCharacterClaimDAO.clearClaim(
			campaignId,
			targetUsername
		);

		const auth = getUserAuth(c);
		const campaignRow =
			await daoFactory.campaignDAO.getCampaignById(campaignId);
		if (campaignRow) {
			void notifyPartyRosterUpdated(
				c.env,
				campaignId,
				campaignRow.name,
				`${auth.username} cleared the player character for ${targetUsername}.`,
				[auth.username]
			);
		}

		return c.json({ success: true, username: targetUsername });
	} catch (error) {
		log.error("[handleClearPlayerCharacterClaim] Failed to clear claim", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** POST /campaigns/:campaignId/player-character-claims/:username/approve */
export async function handleApprovePlayerCharacterClaim(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const targetUsername = requireParam(c, "username");
		if (targetUsername instanceof Response) return targetUsername;
		await requireCanEdit(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const ok = await daoFactory.playerCharacterClaimDAO.approvePendingClaim(
			campaignId,
			targetUsername,
			auth.username
		);
		if (!ok) {
			return c.json(
				{ error: "No pending character claim found for that player" },
				404
			);
		}

		const claim = await daoFactory.playerCharacterClaimDAO.getClaimForUser(
			campaignId,
			targetUsername
		);

		const campaignRow =
			await daoFactory.campaignDAO.getCampaignById(campaignId);
		if (campaignRow) {
			void notifyPartyRosterUpdated(
				c.env,
				campaignId,
				campaignRow.name,
				`${auth.username} approved ${targetUsername}'s player character claim.`,
				[auth.username]
			);
		}

		return c.json({ success: true, claim });
	} catch (error) {
		log.error(
			"[handleApprovePlayerCharacterClaim] Failed to approve claim",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/:campaignId/player-character-roster — roster for all members */
export async function handleGetPlayerCharacterRoster(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const auth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const hasAccess = await ensureCampaignAccess(c, campaignId, auth.username);
		if (!hasAccess) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const daoFactory = getDAOFactory(c.env);
		const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
		if (!campaign) {
			return c.json({ error: "Campaign not found" }, 404);
		}

		const role = await getCampaignRole(c, campaignId, auth.username);
		const canManageRosterPrivacy =
			role === CAMPAIGN_ROLES.OWNER || role === CAMPAIGN_ROLES.EDITOR_GM;

		const [pcEntities, claims] = await Promise.all([
			daoFactory.entityDAO.listEntitiesByCampaign(campaignId, {
				entityType: "pcs",
				orderBy: "name",
			}),
			daoFactory.playerCharacterClaimDAO.listClaimsForCampaign(campaignId),
		]);

		const claimByEntityId = new Map(
			claims.map((row) => [row.entityId, row] as const)
		);

		const characters = pcEntities.map((e) => {
			const claim = claimByEntityId.get(e.id) ?? null;
			const sheet = publicPcSheetSummary(e.content);
			const pending = claim?.claimStatus === "pending";
			const isSubject = claim?.username === auth.username;
			const hideForPending = pending && !canManageRosterPrivacy && !isSubject;
			return {
				entityId: e.id,
				name: e.name,
				displayName: sheet.displayName,
				subtitle: sheet.subtitle,
				unclaimed: !claim,
				claim: claim
					? {
							username: hideForPending ? null : claim.username,
							assignedBy: hideForPending ? null : claim.assignedBy,
							claimStatus: claim.claimStatus,
							updatedAt: claim.updatedAt,
						}
					: null,
			};
		});

		return c.json({
			campaignId,
			gameSystem: campaign.game_system ?? "generic",
			gameSystemVersion: campaign.game_system_version ?? null,
			pcClaimRequiresGmApproval:
				(campaign.pc_claim_requires_gm_approval ?? 0) === 1,
			characters,
			claimCount: claims.length,
		});
	} catch (error) {
		log.error("[handleGetPlayerCharacterRoster] Failed to load roster", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}
