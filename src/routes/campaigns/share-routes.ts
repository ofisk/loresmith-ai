import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleApproveResourceProposal,
	handleCreateResourceProposal,
	handleDownloadFileFromProposal,
	handleListResourceProposals,
	handleRejectResourceProposal,
} from "@/routes/campaign-resource-proposals";
import {
	handleAssignPlayerCharacterClaim,
	handleClearPlayerCharacterClaim,
	handleCreatePlayerCharacterClaim,
	handleCreateShareLink,
	handleGetPlayerCharacterClaimOptions,
	handleListPlayerCharacterClaims,
	handleListShareLinks,
	handleRevokeShareLink,
} from "@/routes/campaign-share";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { API_CONFIG } from "@/shared-config";

export function registerCampaignShareRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(":campaignId")),
		requireUserJwt,
		handleCreateShareLink
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS(":campaignId")),
		requireUserJwt,
		handleListShareLinks
	);
	app.delete(
		toApiRoutePath(API_CONFIG.ENDPOINTS.CAMPAIGNS.SHARE_LINKS_REVOKE_PATTERN),
		requireUserJwt,
		handleRevokeShareLink
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_OPTIONS(
				":campaignId"
			)
		),
		requireUserJwt,
		handleGetPlayerCharacterClaimOptions
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM(":campaignId")
		),
		requireUserJwt,
		handleCreatePlayerCharacterClaim
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIMS(":campaignId")
		),
		requireUserJwt,
		handleListPlayerCharacterClaims
	);
	app.put(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_ASSIGN(
				":campaignId",
				":username"
			)
		),
		requireUserJwt,
		handleAssignPlayerCharacterClaim
	);
	app.delete(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.PLAYER_CHARACTER_CLAIM_ASSIGN(
				":campaignId",
				":username"
			)
		),
		requireUserJwt,
		handleClearPlayerCharacterClaim
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(":campaignId")
		),
		requireUserJwt,
		handleCreateResourceProposal
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(":campaignId")
		),
		requireUserJwt,
		handleListResourceProposals
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_APPROVE(
				":campaignId",
				":id"
			)
		),
		requireUserJwt,
		handleApproveResourceProposal
	);
	app.post(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_REJECT(
				":campaignId",
				":id"
			)
		),
		requireUserJwt,
		handleRejectResourceProposal
	);
	app.get(
		toApiRoutePath(
			API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSAL_DOWNLOAD(
				":campaignId",
				":id"
			)
		),
		requireUserJwt,
		handleDownloadFileFromProposal
	);
}
