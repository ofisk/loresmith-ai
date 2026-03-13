import { getDAOFactory } from "@/dao/dao-factory";
import { notifyRebuildStatus } from "@/lib/notifications-rebuild";
import type { Env } from "@/middleware/auth";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";
import { getRebuildPipelineService } from "./graph-service-factory";

export class RebuildQueueProcessor {
	constructor(private env: Env) {}

	/**
	 * Process a rebuild queue message
	 */
	async processRebuild(message: RebuildQueueMessage): Promise<void> {
		const {
			rebuildId,
			campaignId,
			rebuildType,
			affectedEntityIds,
			options,
			mode,
			requestedRadius,
			idempotencyToken,
			dirtyEntitySeedIds,
		} = message;

		try {
			const daoFactory = getDAOFactory(this.env);
			const pipelineService = await getRebuildPipelineService(this.env);

			// Send started notification
			const rebuildStatusDAO = daoFactory.rebuildStatusDAO;
			const initialStatus = await rebuildStatusDAO.getRebuildById(rebuildId);
			if (initialStatus) {
				await notifyRebuildStatus(this.env, campaignId, initialStatus).catch(
					(_error) => {}
				);
			}

			// Execute rebuild
			const result = await pipelineService.executeRebuild(
				rebuildId,
				campaignId,
				rebuildType,
				affectedEntityIds,
				options || {},
				{
					mode,
					requestedRadius,
					idempotencyToken,
					dirtyEntitySeedIds,
				}
			);

			// Fetch final status for notification
			const finalStatus = await rebuildStatusDAO.getRebuildById(rebuildId);
			if (finalStatus) {
				await notifyRebuildStatus(this.env, campaignId, finalStatus).catch(
					(_error) => {}
				);
			}

			if (result.success) {
			} else {
				throw new Error(result.error || "Rebuild failed");
			}
		} catch (error) {
			// Send failure notification if status was updated
			try {
				const daoFactory = getDAOFactory(this.env);
				const failedStatus =
					await daoFactory.rebuildStatusDAO.getRebuildById(rebuildId);
				if (failedStatus && failedStatus.status === "failed") {
					await notifyRebuildStatus(this.env, campaignId, failedStatus).catch(
						(_notifyError) => {}
					);
				}
			} catch (_notifyError) {}

			throw error;
		}
	}

	/**
	 * Handle queue messages with retry logic
	 */
	async handleMessage(message: RebuildQueueMessage): Promise<void> {
		const maxRetries = 3;
		let retryCount = 0;

		while (retryCount < maxRetries) {
			try {
				await this.processRebuild(message);
				return; // Success, exit retry loop
			} catch (error) {
				retryCount++;

				if (retryCount >= maxRetries) {
					throw error;
				}

				// Exponential backoff
				const delay = 2 ** retryCount * 1000; // 2s, 4s, 8s
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}
}
