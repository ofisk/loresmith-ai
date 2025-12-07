import type { Queue } from "@cloudflare/workers-types";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";

export class RebuildQueueService {
  constructor(private readonly queue: Queue<RebuildQueueMessage>) {}

  /**
   * Enqueue a rebuild job
   */
  async enqueueRebuild(message: RebuildQueueMessage): Promise<void> {
    try {
      await this.queue.send(message);
      console.log(
        `[RebuildQueueService] Enqueued rebuild ${message.rebuildId} for campaign ${message.campaignId} (type: ${message.rebuildType})`
      );
    } catch (error) {
      console.error(
        `[RebuildQueueService] Failed to enqueue rebuild ${message.rebuildId}:`,
        error
      );
      throw error;
    }
  }
}
