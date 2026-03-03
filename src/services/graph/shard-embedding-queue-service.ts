import type { Queue } from "@cloudflare/workers-types";
import type { ShardEmbeddingQueueMessage } from "@/types/shard-embedding-queue";

export class ShardEmbeddingQueueService {
	constructor(private readonly queue: Queue<ShardEmbeddingQueueMessage>) {}

	async enqueueShardEmbedding(
		message: ShardEmbeddingQueueMessage
	): Promise<void> {
		try {
			await this.queue.send(message);
			console.log(
				`[ShardEmbeddingQueueService] Enqueued embedding for ${message.entityIds.length} entities in campaign ${message.campaignId}`
			);
		} catch (error) {
			console.error(
				`[ShardEmbeddingQueueService] Failed to enqueue shard embedding:`,
				error
			);
			throw error;
		}
	}
}
