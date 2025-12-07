import type { Env } from "@/middleware/auth";
import { getDAOFactory } from "@/dao/dao-factory";
import { RebuildPipelineService } from "./rebuild-pipeline-service";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";
import { WorldStateChangelogDAO } from "@/dao/world-state-changelog-dao";

export class RebuildQueueProcessor {
  constructor(private env: Env) {}

  /**
   * Process a rebuild queue message
   */
  async processRebuild(message: RebuildQueueMessage): Promise<void> {
    const startTime = Date.now();
    const { rebuildId, campaignId, rebuildType, affectedEntityIds, options } =
      message;

    console.log(
      `[RebuildQueueProcessor] Starting rebuild ${rebuildId} for campaign ${campaignId} (type: ${rebuildType})`
    );

    try {
      const daoFactory = getDAOFactory(this.env);
      const openaiApiKey = this.env.OPENAI_API_KEY as string | undefined;

      // Instantiate WorldStateChangelogDAO directly (not exposed in DAOFactory)
      const worldStateChangelogDAO = new WorldStateChangelogDAO(this.env.DB!);

      // Initialize rebuild pipeline service
      const pipelineService = new RebuildPipelineService(
        this.env.DB!,
        daoFactory.rebuildStatusDAO,
        daoFactory.entityDAO,
        daoFactory.communityDAO,
        daoFactory.communitySummaryDAO,
        daoFactory.entityImportanceDAO,
        daoFactory.campaignDAO,
        worldStateChangelogDAO,
        openaiApiKey
      );

      // Execute rebuild
      const result = await pipelineService.executeRebuild(
        rebuildId,
        campaignId,
        rebuildType,
        affectedEntityIds,
        options || {}
      );

      const processingTime = Date.now() - startTime;

      if (result.success) {
        console.log(
          `[RebuildQueueProcessor] Rebuild ${rebuildId} completed successfully in ${processingTime}ms: ${result.communitiesCount} communities`
        );
      } else {
        console.error(
          `[RebuildQueueProcessor] Rebuild ${rebuildId} failed after ${processingTime}ms: ${result.error}`
        );
        throw new Error(result.error || "Rebuild failed");
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `[RebuildQueueProcessor] Error processing rebuild ${rebuildId} after ${processingTime}ms:`,
        error
      );
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
        console.error(
          `[RebuildQueueProcessor] Attempt ${retryCount}/${maxRetries} failed:`,
          error
        );

        if (retryCount >= maxRetries) {
          console.error(
            `[RebuildQueueProcessor] Max retries exceeded for rebuild ${message.rebuildId}`
          );
          throw error;
        }

        // Exponential backoff
        const delay = 2 ** retryCount * 1000; // 2s, 4s, 8s
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
