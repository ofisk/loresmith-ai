import type { Queue } from "@cloudflare/workers-types";
import type { ShardEmbeddingQueueMessage } from "@/types/shard-embedding-queue";

export class ShardEmbeddingQueueService {
	constructor(private readonly queue: Queue<ShardEmbeddingQueueMessage>) {}

	async enqueueShardEmbedding(
		message: ShardEmbeddingQueueMessage
	): Promise<void> {
		await this.queue.send(message);
	}
}
