import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { EntityExtractionQueueDAO } from "@/dao/entity-extraction-queue-dao";
import type { Env } from "@/middleware/auth";

/**
 * True when a campaign still has library files or entity-extraction queue work in flight.
 * Used to defer graph rebuilds and related LLM work until processing settles.
 */
export async function campaignHasActiveDocumentProcessing(
	env: { DB?: D1Database },
	campaignId: string
): Promise<boolean> {
	if (!env.DB) {
		return false;
	}
	const queueDao = new EntityExtractionQueueDAO(env.DB);
	const queued = await queueDao.countActiveJobsForCampaign(campaignId);
	if (queued > 0) {
		return true;
	}
	const daoFactory = getDAOFactory(env as Env);
	const filesProcessing =
		await daoFactory.campaignDAO.countResourcesWithFilesStillProcessing(
			campaignId
		);
	return filesProcessing > 0;
}
