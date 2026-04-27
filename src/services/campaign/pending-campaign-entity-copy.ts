import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { tryCopyLibraryEntitiesToCampaign } from "@/services/campaign/library-entity-copy-to-campaign-service";
import { LibraryEntityDiscoveryQueueService } from "@/services/campaign/library-entity-discovery-queue-service";

export type PendingAttribution = { proposedBy: string; approvedBy: string };

/**
 * When a file is added to a campaign but library entity extraction is not ready,
 * queue library discovery and mark the campaign resource as pending.
 */
export async function ensureLibraryDiscoveryAndMarkResourcePending(options: {
	env: Env;
	username: string;
	campaignId: string;
	resourceId: string;
	fileKey: string;
	fileName: string;
	pendingAttribution?: PendingAttribution;
}): Promise<void> {
	const { env, username, campaignId, resourceId, fileKey, pendingAttribution } =
		options;
	await LibraryEntityDiscoveryQueueService.queueDiscoveryAfterIndexing(
		env,
		fileKey,
		username
	);
	const attrJson = pendingAttribution
		? JSON.stringify(pendingAttribution)
		: null;
	const campaignDAO = getDAOFactory(env).campaignDAO;
	await campaignDAO.setCampaignResourceEntityCopyStatus(
		campaignId,
		resourceId,
		"pending_library",
		attrJson
	);
}

/**
 * After library_entity_discovery completes for a file, copy entities into all campaigns
 * that were waiting on this file.
 */
export async function processPendingCampaignEntityCopiesForFile(
	env: Env,
	fileKey: string
): Promise<void> {
	const log = createLogger(env, "[PendingCampaignEntityCopy]");
	const campaignDAO = getDAOFactory(env).campaignDAO;
	const libDao = new LibraryEntityDAO(env.DB);
	if (!(await libDao.isSchemaReady())) {
		return;
	}

	const discovery = await libDao.getDiscovery(fileKey);
	if (!discovery || discovery.status !== "complete") {
		return;
	}

	const pending = await campaignDAO.listResourcesPendingLibraryCopy(fileKey);
	if (pending.length === 0) {
		return;
	}

	const candidates = await libDao.listCandidatesForFile(fileKey);

	for (const row of pending) {
		const campaign = await campaignDAO.getCampaignById(row.campaign_id);
		if (!campaign) {
			continue;
		}
		let attribution: PendingAttribution | undefined;
		if (row.pending_attribution) {
			try {
				attribution = JSON.parse(row.pending_attribution) as PendingAttribution;
			} catch {
				// ignore
			}
		}

		if (candidates.length === 0) {
			await campaignDAO.setCampaignResourceEntityCopyStatus(
				row.campaign_id,
				row.id,
				"complete",
				null
			);
			log.info("pending_copy_skipped_no_candidates", {
				fileKey,
				resourceId: row.id,
			});
			continue;
		}

		const copied = await tryCopyLibraryEntitiesToCampaign({
			env,
			username: campaign.username,
			campaignId: row.campaign_id,
			campaignName: campaign.name,
			resourceId: row.id,
			fileKey,
			fileName: row.file_name,
			attribution,
		});

		if (copied) {
			await campaignDAO.setCampaignResourceEntityCopyStatus(
				row.campaign_id,
				row.id,
				"complete",
				null
			);
		} else {
			await campaignDAO.setCampaignResourceEntityCopyStatus(
				row.campaign_id,
				row.id,
				"failed",
				row.pending_attribution
			);
			log.warn("pending_copy_failed_after_discovery", {
				fileKey,
				resourceId: row.id,
			});
		}
	}
}
