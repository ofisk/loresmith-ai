export interface ShardEmbeddingQueueMessage {
	type: "shard_embedding";
	entityIds: string[];
	campaignId: string;
	username: string;
}
