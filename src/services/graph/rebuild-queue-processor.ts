import { getDAOFactory } from "@/dao/dao-factory";
import { notifyRebuildStatus } from "@/lib/notifications-rebuild";
import type { Env } from "@/middleware/auth";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";
import { getRebuildPipelineService } from "./graph-service-factory";

/** Must match `max_retries` for the graph-rebuild queue consumer in wrangler config. */
export const GRAPH_REBUILD_QUEUE_MAX_ATTEMPTS = 5;

/**
 * Delay before the next delivery after a failed attempt (exponential backoff, capped).
 * `attempts` is the Cloudflare Queue message attempt count (starts at 1).
 */
export function graphRebuildRetryDelaySeconds(attempts: number): number {
	const base = 45;
	const cap = 3600;
	const exp = Math.max(0, attempts - 1);
	return Math.max(1, Math.min(Math.floor(base * 2 ** exp), cap));
}

export interface GraphRebuildQueueContext {
	queueAttempt: number;
	maxAttempts: number;
}

export class RebuildQueueProcessor {
	constructor(private env: Env) {}

	/**
	 * Single processing attempt for a graph rebuild queue message.
	 * Retries with exponential backoff are handled by the queue consumer via
	 * `message.retry({ delaySeconds })`.
	 */
	async processRebuild(
		message: RebuildQueueMessage,
		ctx: GraphRebuildQueueContext
	): Promise<{ success: boolean }> {
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
		const { queueAttempt, maxAttempts } = ctx;

		try {
			const daoFactory = getDAOFactory(this.env);
			const pipelineService = await getRebuildPipelineService(this.env);

			const rebuildStatusDAO = daoFactory.rebuildStatusDAO;
			const initialStatus = await rebuildStatusDAO.getRebuildById(rebuildId);
			if (
				initialStatus &&
				queueAttempt === 1 &&
				initialStatus.status !== "failed"
			) {
				await notifyRebuildStatus(this.env, campaignId, initialStatus).catch(
					(_error) => {}
				);
			}

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

			const finalStatus = await rebuildStatusDAO.getRebuildById(rebuildId);
			if (finalStatus) {
				if (finalStatus.status === "completed") {
					await notifyRebuildStatus(this.env, campaignId, finalStatus).catch(
						(_error) => {}
					);
				} else if (
					finalStatus.status === "failed" &&
					queueAttempt >= maxAttempts
				) {
					await notifyRebuildStatus(this.env, campaignId, finalStatus).catch(
						(_error) => {}
					);
				}
			}

			return { success: result.success };
		} catch (error) {
			try {
				const daoFactory = getDAOFactory(this.env);
				const failedStatus =
					await daoFactory.rebuildStatusDAO.getRebuildById(rebuildId);
				if (
					failedStatus &&
					failedStatus.status === "failed" &&
					queueAttempt >= maxAttempts
				) {
					await notifyRebuildStatus(this.env, campaignId, failedStatus).catch(
						(_notifyError) => {}
					);
				}
			} catch (_notifyError) {}

			throw error;
		}
	}
}
