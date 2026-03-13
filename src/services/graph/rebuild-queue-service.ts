import type { Queue } from "@cloudflare/workers-types";
import type { RebuildQueueMessage } from "@/types/rebuild-queue";

export class RebuildQueueService {
	constructor(private readonly queue: Queue<RebuildQueueMessage>) {}

	/**
	 * Enqueue a rebuild job
	 */
	async enqueueRebuild(message: RebuildQueueMessage): Promise<void> {
		await this.queue.send(message);
	}
}
