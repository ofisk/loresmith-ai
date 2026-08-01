import { getDAOFactory } from "@/dao/dao-factory";
import { LibraryEntityDAO } from "@/dao/library-entity-dao";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { tryCopyLibraryEntitiesToCampaign } from "@/services/campaign/library-entity-copy-to-campaign-service";
import { LibraryEntityDiscoveryQueueService } from "@/services/campaign/library-entity-discovery-queue-service";

export type PendingAttribution = { proposedBy: string; approvedBy: string };

/**
 * When a file is added to a campaign but library entity extraction is not ready,
 * mark the campaign resource as pending and queue library discovery.
 *
 * Order matters: the resource must be marked `pending_library` *before* discovery
 * is queued, because `queueDiscoveryAfterIndexing` kicks off processing
 * fire-and-forget and a fast discovery would otherwise run its pending-copy sweep
 * before this row exists to be found.
 *
 * Discovery is only queued once RAG indexing has finished — for a file that is
 * still uploading/indexing, `SyncQueueService` queues discovery itself when
 * indexing completes. Queueing early would just burn the job's retry budget on
 * "File not ready for discovery".
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

	const fileRecord = await getDAOFactory(env).fileDAO.getFileForRag(
		fileKey,
		username
	);
	if (fileRecord?.status !== "completed") {
		createLogger(env, "[PendingCampaignEntityCopy]").info(
			"discovery_deferred_until_indexed",
			{ fileKey, resourceId, fileStatus: fileRecord?.status ?? "unknown" }
		);
		return;
	}

	await LibraryEntityDiscoveryQueueService.queueDiscoveryAfterIndexing(
		env,
		fileKey,
		username
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

/** Files swept per scheduled run, so one tick cannot fan out unbounded. */
const MAX_PENDING_FILES_PER_SWEEP = 25;

/**
 * A deferred add queues discovery only once its file finishes indexing, and that
 * hand-off lives in `SyncQueueService`. If it was missed (worker died, indexing
 * finished before the deferral was recorded), the file is RAG-complete with no
 * discovery row at all — queue one so the pending resource can make progress.
 */
async function ensureDiscoveryQueuedForPendingFile(
	env: Env,
	fileKey: string
): Promise<void> {
	const libDao = new LibraryEntityDAO(env.DB);
	if (!(await libDao.isSchemaReady())) {
		return;
	}
	if (await libDao.getDiscovery(fileKey)) {
		return;
	}
	const campaignDAO = getDAOFactory(env).campaignDAO;
	const [firstPending] =
		await campaignDAO.listResourcesPendingLibraryCopy(fileKey);
	if (!firstPending) {
		return;
	}
	const campaign = await campaignDAO.getCampaignById(firstPending.campaign_id);
	if (!campaign) {
		return;
	}
	const fileRecord = await getDAOFactory(env).fileDAO.getFileForRag(
		fileKey,
		campaign.username
	);
	if (fileRecord?.status !== "completed") {
		return;
	}
	await LibraryEntityDiscoveryQueueService.queueDiscoveryAfterIndexing(
		env,
		fileKey,
		campaign.username
	);
	createLogger(env, "[PendingCampaignEntityCopy]").info(
		"discovery_queued_by_sweep",
		{ fileKey }
	);
}

/**
 * Safety net for deferred campaign adds: copy entities for any resource still
 * marked `pending_library` whose file has since finished discovery.
 *
 * The happy path is driven by `LibraryEntityDiscoveryQueueService` calling
 * `processPendingCampaignEntityCopiesForFile` the moment discovery completes.
 * This sweep covers the cases that hook cannot: the resource was marked pending
 * after discovery had already completed, the worker died mid-copy, or discovery
 * completed while the copy failed transiently.
 */
export async function sweepPendingCampaignEntityCopies(
	env: Env,
	maxFiles: number = MAX_PENDING_FILES_PER_SWEEP
): Promise<{ swept: number }> {
	const log = createLogger(env, "[PendingCampaignEntityCopy]");
	const campaignDAO = getDAOFactory(env).campaignDAO;
	const fileKeys = await campaignDAO.listFileKeysPendingLibraryCopy(maxFiles);
	let swept = 0;
	for (const fileKey of fileKeys) {
		try {
			await ensureDiscoveryQueuedForPendingFile(env, fileKey);
			await processPendingCampaignEntityCopiesForFile(env, fileKey);
			swept++;
		} catch (e) {
			log.error("pending_copy_sweep_failed", {
				fileKey,
				error: e instanceof Error ? e.message : String(e),
			});
		}
	}
	return { swept };
}
