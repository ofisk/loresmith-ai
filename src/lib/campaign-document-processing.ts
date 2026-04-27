import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";

/**
 * True when a campaign still has library files indexing or resources waiting on library extraction + copy.
 * Used to defer graph rebuilds and related LLM work until processing settles.
 */
export async function campaignHasActiveDocumentProcessing(
	env: { DB?: D1Database },
	campaignId: string
): Promise<boolean> {
	if (!env.DB) {
		return false;
	}
	const daoFactory = getDAOFactory(env as Env);
	const pendingCopy =
		await daoFactory.campaignDAO.countResourcesWithPendingLibraryEntityCopy(
			campaignId
		);
	if (pendingCopy > 0) {
		return true;
	}
	const filesProcessing =
		await daoFactory.campaignDAO.countResourcesWithFilesStillProcessing(
			campaignId
		);
	return filesProcessing > 0;
}
