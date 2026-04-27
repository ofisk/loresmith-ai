import type { Context } from "hono";
import { CAMPAIGN_ROLES } from "@/constants/campaign-roles";
import { FileDAO } from "@/dao";
import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import {
	addResourceToCampaign,
	checkResourceExists,
} from "@/lib/campaign-operations";
import {
	getExtension,
	validateR2ObjectAndGetStream,
} from "@/lib/file/file-upload-security";
import { isLibraryEntityDiscoveryInFlight } from "@/lib/library-entity-pipeline";
import { getRequestLogger } from "@/lib/logger";
import {
	notifyProposalApproved,
	notifyProposalRejected,
} from "@/lib/notifications";
import {
	getBlockedExtensionsDescription,
	isFileAllowedForProposal,
} from "@/lib/proposal-security";
import {
	getUserAuth,
	requireCampaignRole,
	requireCanApproveShards,
	requireParam,
} from "@/lib/route-utils";
import type { Env } from "@/middleware/auth";
import { tryCopyLibraryEntitiesToCampaign } from "@/services/campaign/library-entity-copy-to-campaign-service";
import { ensureLibraryDiscoveryAndMarkResourcePending } from "@/services/campaign/pending-campaign-entity-copy";
import type { AuthPayload } from "@/services/core/auth-service";
import { ResourceAddRateLimitService } from "@/services/resource-add-rate-limit-service";

type ContextWithAuth = Context<{ Bindings: Env }> & {
	userAuth?: AuthPayload;
};

/** POST /campaigns/:campaignId/resource-proposals - propose document (editor_player only) */
export async function handleCreateResourceProposal(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const userAuth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const body = (await c.req.json()) as {
			fileKey: string;
			fileName: string;
			confirmedLegal?: boolean;
		};

		if (!body.fileKey || !body.fileName) {
			return c.json({ error: "fileKey and fileName are required" }, 400);
		}

		if (body.confirmedLegal !== true) {
			return c.json(
				{
					error: "Legal confirmation required",
					requiresConfirmation: true,
					legalNotice:
						"By proposing this file, you grant the campaign GM read access to review it. You must confirm you have the right to share this content and it does not contain malicious or illegal material.",
				},
				400
			);
		}

		// Must be editor_player
		await requireCampaignRole(c, campaignId, [CAMPAIGN_ROLES.EDITOR_PLAYER]);

		const daoFactory = getDAOFactory(c.env);

		// Verify file is in proposer's library (need fileMeta for fallback name and ownership)
		const fileMeta = await daoFactory.fileDAO.getFileMetadata(body.fileKey);
		if (!fileMeta || fileMeta.username !== userAuth.username) {
			return c.json({ error: "File not found in your library" }, 404);
		}

		// Resolve effective fileName for allowlist: use provided name if allowed, else stored name (e.g. agent sends display name without extension)
		const effectiveFileName = isFileAllowedForProposal(body.fileName)
			? body.fileName
			: isFileAllowedForProposal(fileMeta.file_name)
				? fileMeta.file_name
				: null;
		if (!effectiveFileName) {
			return c.json(
				{
					error: `This file type is not allowed. Allowed formats: ${getBlockedExtensionsDescription()}`,
				},
				400
			);
		}

		// Magic-byte validation: verify file content matches claimed extension
		try {
			const r2Object = await c.env.R2.get(body.fileKey);
			if (r2Object) {
				const ext = getExtension(effectiveFileName);
				const validation = await validateR2ObjectAndGetStream(r2Object, ext);
				if (!validation.valid) {
					return c.json({ error: validation.error }, 400);
				}
			}
		} catch (validateErr) {
			log.warn(
				"[handleCreateResourceProposal] File validation failed",
				validateErr
			);
			return c.json(
				{
					error:
						"File validation failed. The file may be corrupted or mislabeled.",
				},
				400
			);
		}

		// Check if already in campaign
		const existing = await checkResourceExists(campaignId, body.fileKey, c.env);
		if (existing.exists) {
			return c.json({ error: "File is already in this campaign" }, 409);
		}

		// Check for existing pending proposal
		const hasExisting =
			await daoFactory.campaignResourceProposalDAO.hasExistingProposal(
				campaignId,
				body.fileKey,
				userAuth.username
			);
		if (hasExisting) {
			return c.json(
				{ error: "You have already proposed this file for this campaign" },
				409
			);
		}

		const id = crypto.randomUUID();
		await daoFactory.campaignResourceProposalDAO.createProposal(
			id,
			campaignId,
			body.fileKey,
			effectiveFileName,
			userAuth.username
		);

		return c.json(
			{
				id,
				campaignId,
				fileKey: body.fileKey,
				fileName: effectiveFileName,
				status: "pending",
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
					error: "Only editor players can propose resources for this campaign",
				},
				403
			);
		}
		log.error(
			"[handleCreateResourceProposal] Failed to create proposal",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/:campaignId/resource-proposals - list pending proposals (editor_gm, owner) */
export async function handleListResourceProposals(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		await requireCanApproveShards(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const proposals =
			await daoFactory.campaignResourceProposalDAO.listPendingProposals(
				campaignId
			);

		return c.json({
			proposals: proposals.map((p) => ({
				id: p.id,
				campaignId: p.campaign_id,
				fileKey: p.file_key,
				fileName: p.file_name,
				proposedBy: p.proposed_by,
				status: p.status,
				createdAt: p.created_at,
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
				{ error: "You do not have permission to view resource proposals" },
				403
			);
		}
		log.error("[handleListResourceProposals] Failed to list proposals", error);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** POST /campaigns/:campaignId/resource-proposals/:id/approve */
export async function handleApproveResourceProposal(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const userAuth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const id = requireParam(c, "id");
		if (id instanceof Response) return id;

		await requireCanApproveShards(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const proposal =
			await daoFactory.campaignResourceProposalDAO.getProposalById(
				id,
				campaignId
			);

		if (!proposal || proposal.status !== "pending") {
			return c.json({ error: "Proposal not found or already processed" }, 404);
		}

		const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
		const campaignName = campaign?.name ?? "Campaign";

		// Check if file is already in campaign (race condition)
		const existing = await checkResourceExists(
			campaignId,
			proposal.file_key,
			c.env
		);
		if (existing.exists) {
			await daoFactory.campaignResourceProposalDAO.approveProposal(
				id,
				campaignId,
				userAuth.username
			);
			if (proposal.proposed_by && proposal.proposed_by !== userAuth.username) {
				notifyProposalApproved(
					c.env,
					proposal.proposed_by,
					campaignName,
					proposal.file_name
				).catch(() => {});
			}
			return c.json({
				success: true,
				message: "File was already added to campaign",
				resourceId: existing.resource?.id,
			});
		}

		const addLimit = await ResourceAddRateLimitService.checkAddLimit(
			userAuth.username,
			campaignId,
			userAuth.isAdmin ?? false,
			c.env
		);
		if (!addLimit.allowed) {
			return c.json(
				{
					error: addLimit.reason,
					code: "RESOURCE_ADD_RATE_LIMIT",
					limit: addLimit.limit,
					current: addLimit.current,
				},
				429
			);
		}

		const fileRecord = await daoFactory.fileDAO.getFileForRag(
			proposal.file_key,
			userAuth.username
		);
		if (!fileRecord) {
			return c.json({ error: "File not found in library" }, 404);
		}
		if (fileRecord.status !== FileDAO.STATUS.COMPLETED) {
			return c.json(
				{
					error: "File is not yet indexed",
					status: fileRecord.status,
				},
				400
			);
		}
		const libEntityDao = new LibraryEntityDAO(c.env.DB);
		if (await libEntityDao.isSchemaReady()) {
			const discovery = await libEntityDao.getDiscovery(proposal.file_key);
			if (discovery && isLibraryEntityDiscoveryInFlight(discovery.status)) {
				return c.json(
					{
						error:
							"Entity indexing is still in progress. Try again when the library shows ready.",
						code: "LIBRARY_DISCOVERY_IN_PROGRESS",
						libraryEntityDiscoveryStatus: discovery.status,
					},
					409
				);
			}
		}

		const resourceId = crypto.randomUUID();
		await addResourceToCampaign({
			env: c.env,
			username: userAuth.username,
			campaignId,
			resourceId,
			fileKey: proposal.file_key,
			fileName: proposal.file_name,
		});

		await ResourceAddRateLimitService.recordAdd(
			userAuth.username,
			campaignId,
			c.env
		);

		await daoFactory.campaignResourceProposalDAO.approveProposal(
			id,
			campaignId,
			userAuth.username
		);

		if (proposal.proposed_by && proposal.proposed_by !== userAuth.username) {
			notifyProposalApproved(
				c.env,
				proposal.proposed_by,
				campaignName,
				proposal.file_name
			).catch(() => {});
		}

		// Library copy when discovery is complete; else queue library discovery and mark resource pending.
		// Pass proposedBy on pending path so shards show "co-authored by proposer and approver".
		try {
			const campaignRow =
				await daoFactory.campaignDAO.getCampaignById(campaignId);
			const campaignNameResolved = campaignRow?.name ?? "Campaign";

			const attribution =
				proposal.proposed_by && proposal.proposed_by !== userAuth.username
					? {
							proposedBy: proposal.proposed_by,
							approvedBy: userAuth.username,
						}
					: undefined;

			const copied = await tryCopyLibraryEntitiesToCampaign({
				env: c.env,
				username: userAuth.username,
				campaignId,
				campaignName: campaignNameResolved,
				resourceId,
				fileKey: proposal.file_key,
				fileName: proposal.file_name,
				attribution,
			});

			if (!copied) {
				await ensureLibraryDiscoveryAndMarkResourcePending({
					env: c.env,
					username: userAuth.username,
					campaignId,
					resourceId,
					fileKey: proposal.file_key,
					fileName: proposal.file_name,
					pendingAttribution: attribution,
				});
			}
		} catch (queueError) {
			log.warn(
				"[handleApproveResourceProposal] Library entity pipeline failed",
				queueError
			);
		}

		return c.json({
			success: true,
			resourceId,
			message: "Proposal approved; resource added",
		});
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "CampaignAccessDeniedError"
		) {
			return c.json(
				{ error: "You do not have permission to approve proposals" },
				403
			);
		}
		log.error(
			"[handleApproveResourceProposal] Failed to approve proposal",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** GET /campaigns/:campaignId/resource-proposals/:id/download - download the file for GM review (editor_gm, owner) */
export async function handleDownloadFileFromProposal(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const id = requireParam(c, "id");
		if (id instanceof Response) return id;

		await requireCanApproveShards(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const proposal =
			await daoFactory.campaignResourceProposalDAO.getProposalById(
				id,
				campaignId
			);

		if (!proposal || proposal.status !== "pending") {
			return c.json({ error: "Proposal not found or already processed" }, 404);
		}

		if (!isFileAllowedForProposal(proposal.file_name)) {
			return c.json(
				{
					error: `This file type is not allowed. Allowed formats: ${getBlockedExtensionsDescription()}`,
				},
				400
			);
		}

		const object = await c.env.R2.get(proposal.file_key);
		if (!object) {
			return c.json({ error: "File not found in storage" }, 404);
		}

		// Magic-byte validation: verify file content matches claimed extension
		let bodyStream: ReadableStream;
		try {
			const ext = getExtension(proposal.file_name);
			const validation = await validateR2ObjectAndGetStream(object, ext);
			if (!validation.valid) {
				return c.json({ error: validation.error }, 400);
			}
			bodyStream = validation.stream;
		} catch (validateErr) {
			log.warn(
				"[handleDownloadFileFromProposal] File validation failed",
				validateErr
			);
			return c.json(
				{
					error:
						"File validation failed. The file may be corrupted or mislabeled.",
				},
				400
			);
		}

		const contentType =
			object.httpMetadata?.contentType || "application/octet-stream";
		const fileName = proposal.file_name;
		const contentDisposition = `attachment; filename="${encodeURIComponent(fileName)}"`;

		return new Response(bodyStream, {
			status: 200,
			headers: {
				"Content-Type": contentType,
				"Content-Disposition": contentDisposition,
				"Content-Length": String(object.size),
			},
		});
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "CampaignAccessDeniedError"
		) {
			return c.json(
				{ error: "You do not have permission to download this file" },
				403
			);
		}
		log.error(
			"[handleDownloadFileFromProposal] Failed to download file",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}

/** POST /campaigns/:campaignId/resource-proposals/:id/reject */
export async function handleRejectResourceProposal(c: ContextWithAuth) {
	const log = getRequestLogger(c);
	try {
		const userAuth = getUserAuth(c);
		const campaignId = requireParam(c, "campaignId");
		if (campaignId instanceof Response) return campaignId;
		const id = requireParam(c, "id");
		if (id instanceof Response) return id;

		await requireCanApproveShards(c, campaignId);

		const daoFactory = getDAOFactory(c.env);
		const proposal =
			await daoFactory.campaignResourceProposalDAO.getProposalById(
				id,
				campaignId
			);

		if (!proposal || proposal.status !== "pending") {
			return c.json({ error: "Proposal not found or already processed" }, 404);
		}

		await daoFactory.campaignResourceProposalDAO.rejectProposal(
			id,
			campaignId,
			userAuth.username
		);

		const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
		const campaignName = campaign?.name ?? "campaign";
		if (proposal.proposed_by && proposal.proposed_by !== userAuth.username) {
			notifyProposalRejected(
				c.env,
				proposal.proposed_by,
				campaignName,
				proposal.file_name
			).catch(() => {});
		}

		return c.json({ success: true, message: "Proposal rejected" });
	} catch (error: unknown) {
		if (
			error &&
			typeof error === "object" &&
			"name" in error &&
			error.name === "CampaignAccessDeniedError"
		) {
			return c.json(
				{ error: "You do not have permission to reject proposals" },
				403
			);
		}
		log.error(
			"[handleRejectResourceProposal] Failed to reject proposal",
			error
		);
		return c.json({ error: "Internal server error" }, 500);
	}
}
