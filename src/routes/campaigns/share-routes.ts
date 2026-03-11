import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
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
import {
	routeApproveResourceProposal,
	routeAssignPlayerCharacterClaim,
	routeClearPlayerCharacterClaim,
	routeCreatePlayerCharacterClaim,
	routeCreateResourceProposal,
	routeCreateShareLink,
	routeDownloadFileFromProposal,
	routeGetPlayerCharacterClaimOptions,
	routeListPlayerCharacterClaims,
	routeListResourceProposals,
	routeListShareLinks,
	routeRejectResourceProposal,
	routeRevokeShareLink,
} from "@/routes/campaigns/share-routes-openapi";
import type { Env } from "@/routes/env";

export function registerCampaignShareRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(
		routeCreateShareLink,
		handleCreateShareLink as unknown as Handler
	);
	app.openapi(routeListShareLinks, handleListShareLinks as unknown as Handler);
	app.openapi(
		routeRevokeShareLink,
		handleRevokeShareLink as unknown as Handler
	);
	app.openapi(
		routeGetPlayerCharacterClaimOptions,
		handleGetPlayerCharacterClaimOptions as unknown as Handler
	);
	app.openapi(
		routeCreatePlayerCharacterClaim,
		handleCreatePlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeListPlayerCharacterClaims,
		handleListPlayerCharacterClaims as unknown as Handler
	);
	app.openapi(
		routeAssignPlayerCharacterClaim,
		handleAssignPlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeClearPlayerCharacterClaim,
		handleClearPlayerCharacterClaim as unknown as Handler
	);
	app.openapi(
		routeCreateResourceProposal,
		handleCreateResourceProposal as unknown as Handler
	);
	app.openapi(
		routeListResourceProposals,
		handleListResourceProposals as unknown as Handler
	);
	app.openapi(
		routeApproveResourceProposal,
		handleApproveResourceProposal as unknown as Handler
	);
	app.openapi(
		routeRejectResourceProposal,
		handleRejectResourceProposal as unknown as Handler
	);
	app.openapi(
		routeDownloadFileFromProposal,
		handleDownloadFileFromProposal as unknown as Handler
	);
}
