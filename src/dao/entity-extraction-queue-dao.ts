import { BaseDAOClass } from "./base-dao";

export interface EntityExtractionQueueItem {
	id: number;
	username: string;
	campaign_id: string;
	resource_id: string;
	resource_name: string;
	file_key: string | null;
	/** Username who proposed the file (for approved proposals); used for shard attribution. Absent when migration 0002 has not run. */
	proposed_by?: string | null;
	status: "pending" | "processing" | "completed" | "failed" | "rate_limited";
	retry_count: number;
	last_error: string | null;
	error_code: string | null;
	next_retry_at: string | null;
	created_at: string;
	processed_at: string | null;
	updated_at: string | null;
}

export class EntityExtractionQueueDAO extends BaseDAOClass {
	/**
	 * Get current queue depth grouped by status, plus "ready now" count
	 * (pending + rate_limited that are due for retry).
	 */
	async getQueueMetrics(): Promise<{
		pending: number;
		processing: number;
		rateLimited: number;
		readyNow: number;
		totalActive: number;
	}> {
		const sql = `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) AS rate_limited,
        SUM(
          CASE
            WHEN status = 'pending' THEN 1
            WHEN status = 'rate_limited' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')) THEN 1
            ELSE 0
          END
        ) AS ready_now
      FROM entity_extraction_queue
      WHERE status IN ('pending', 'processing', 'rate_limited')
    `;

		const row = await this.queryFirst<{
			pending: number | null;
			processing: number | null;
			rate_limited: number | null;
			ready_now: number | null;
		}>(sql, []);

		const pending = row?.pending ?? 0;
		const processing = row?.processing ?? 0;
		const rateLimited = row?.rate_limited ?? 0;
		const readyNow = row?.ready_now ?? 0;

		return {
			pending,
			processing,
			rateLimited,
			readyNow,
			totalActive: pending + processing + rateLimited,
		};
	}

	/** True if entity_extraction_queue has proposed_by column (migration 0002). Checked per-call for correctness across DBs. */
	private async hasProposedByColumn(): Promise<boolean> {
		const rows = await this.queryAll<{ name: string }>(
			"PRAGMA table_info(entity_extraction_queue)",
			[]
		);
		return rows.some((r) => r.name === "proposed_by");
	}

	/**
	 * Add an entity extraction job to the queue
	 * @param proposedBy - When from an approved proposal, the username who proposed the file (for shard attribution)
	 * Works with or without migration 0002 (proposed_by column); uses it when present.
	 */
	async addToQueue(
		username: string,
		campaignId: string,
		resourceId: string,
		resourceName: string,
		fileKey?: string,
		proposedBy?: string | null
	): Promise<void> {
		const withProposedBy = await this.hasProposedByColumn();

		if (withProposedBy) {
			const sql = `
        INSERT INTO entity_extraction_queue (
          username, campaign_id, resource_id, resource_name, file_key, proposed_by,
          status, retry_count, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP)
        ON CONFLICT(campaign_id, resource_id) DO UPDATE SET
          status = 'pending',
          retry_count = 0,
          last_error = NULL,
          error_code = NULL,
          next_retry_at = NULL,
          proposed_by = excluded.proposed_by,
          updated_at = CURRENT_TIMESTAMP
      `;
			await this.execute(sql, [
				username,
				campaignId,
				resourceId,
				resourceName,
				fileKey || null,
				proposedBy ?? null,
			]);
		} else {
			const sql = `
        INSERT INTO entity_extraction_queue (
          username, campaign_id, resource_id, resource_name, file_key,
          status, retry_count, created_at
        )
        VALUES (?, ?, ?, ?, ?, 'pending', 0, CURRENT_TIMESTAMP)
        ON CONFLICT(campaign_id, resource_id) DO UPDATE SET
          status = 'pending',
          retry_count = 0,
          last_error = NULL,
          error_code = NULL,
          next_retry_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      `;
			await this.execute(sql, [
				username,
				campaignId,
				resourceId,
				resourceName,
				fileKey || null,
			]);
		}
	}

	/**
	 * Get pending queue items that are ready to process
	 * (status = 'pending' OR status = 'rate_limited' with next_retry_at <= now)
	 */
	async getPendingQueueItems(
		limit: number = 10
	): Promise<EntityExtractionQueueItem[]> {
		const sql = `
      SELECT * FROM entity_extraction_queue
      WHERE status = 'pending'
         OR (status = 'rate_limited' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now')))
      ORDER BY 
        CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END,
        created_at ASC
      LIMIT ?
    `;
		return await this.queryAll<EntityExtractionQueueItem>(sql, [limit]);
	}

	/**
	 * Get pending queue items for a specific user
	 */
	async getPendingQueueItemsForUser(
		username: string,
		limit: number = 10
	): Promise<EntityExtractionQueueItem[]> {
		const sql = `
      SELECT * FROM entity_extraction_queue
      WHERE username = ?
        AND (status = 'pending'
         OR (status = 'rate_limited' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))))
      ORDER BY 
        CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END,
        created_at ASC
      LIMIT ?
    `;
		return await this.queryAll<EntityExtractionQueueItem>(sql, [
			username,
			limit,
		]);
	}

	/**
	 * Mark a queue item as processing
	 */
	async markAsProcessing(id: number): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'processing', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [id]);
	}

	/**
	 * Persist extraction progress while remaining in processing status.
	 */
	async updateProcessingProgress(
		id: number,
		processedChunks: number,
		totalChunks: number
	): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'processing',
          last_error = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [`PROGRESS:${processedChunks}/${totalChunks}`, id]);
	}

	/**
	 * Mark a queue item as completed
	 */
	async markAsCompleted(id: number): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'completed',
          last_error = NULL,
          error_code = NULL,
          next_retry_at = NULL,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [id]);
	}

	/**
	 * Mark an item back to pending while preserving progress metadata.
	 */
	async markAsPending(
		id: number,
		progressMessage?: string | null
	): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'pending',
          last_error = ?,
          error_code = NULL,
          next_retry_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [progressMessage ?? null, id]);
	}

	/**
	 * Mark a queue item as rate limited and schedule retry
	 */
	async markAsRateLimited(
		id: number,
		retryCount: number,
		nextRetryAt: Date,
		errorMessage?: string
	): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'rate_limited',
          retry_count = ?,
          last_error = ?,
          error_code = 'RATE_LIMIT',
          next_retry_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [
			retryCount,
			errorMessage || null,
			nextRetryAt.toISOString(),
			id,
		]);
	}

	/**
	 * Mark a queue item as failed
	 */
	async markAsFailed(
		id: number,
		errorMessage: string,
		errorCode?: string
	): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'failed',
          last_error = ?,
          error_code = ?,
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [errorMessage, errorCode || null, id]);
	}

	/**
	 * Update retry count for a queue item
	 */
	async updateRetryCount(id: number, retryCount: number): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET retry_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [retryCount, id]);
	}

	/**
	 * Remove a completed or failed item from the queue
	 */
	async removeFromQueue(id: number): Promise<void> {
		const sql = `DELETE FROM entity_extraction_queue WHERE id = ?`;
		await this.execute(sql, [id]);
	}

	/**
	 * Get all unique usernames that have pending queue items
	 */
	async getUsernamesWithPendingItems(): Promise<string[]> {
		const sql = `
      SELECT DISTINCT username 
      FROM entity_extraction_queue 
      WHERE status IN ('pending', 'rate_limited')
    `;
		const results = await this.queryAll<{ username: string }>(sql, []);
		return results.map((row) => row.username);
	}

	/**
	 * Get campaign IDs that have at least one active extraction job (pending, processing, or rate_limited).
	 * Used to show "Processing documents" in the campaign list.
	 */
	async getCampaignIdsWithActiveExtraction(): Promise<string[]> {
		const sql = `
      SELECT DISTINCT campaign_id
      FROM entity_extraction_queue
      WHERE status IN ('pending', 'processing', 'rate_limited')
    `;
		const results = await this.queryAll<{ campaign_id: string }>(sql, []);
		return results.map((row) => row.campaign_id);
	}

	/**
	 * Get queue item by ID
	 */
	async getQueueItemById(
		id: number
	): Promise<EntityExtractionQueueItem | null> {
		const sql = `SELECT * FROM entity_extraction_queue WHERE id = ?`;
		return await this.queryFirst<EntityExtractionQueueItem>(sql, [id]);
	}

	/**
	 * Get queue item by campaign and resource
	 */
	async getQueueItemByResource(
		campaignId: string,
		resourceId: string
	): Promise<EntityExtractionQueueItem | null> {
		const sql = `
      SELECT * FROM entity_extraction_queue 
      WHERE campaign_id = ? AND resource_id = ?
    `;
		return await this.queryFirst<EntityExtractionQueueItem>(sql, [
			campaignId,
			resourceId,
		]);
	}

	/**
	 * Get queue items that have been stuck in processing status for too long
	 */
	async getStuckProcessingItems(
		timeoutMinutes: number
	): Promise<EntityExtractionQueueItem[]> {
		const sql = `
      SELECT * FROM entity_extraction_queue
      WHERE status = 'processing'
        AND updated_at < datetime('now', '-' || ? || ' minutes')
      ORDER BY updated_at ASC
    `;
		return await this.queryAll<EntityExtractionQueueItem>(sql, [
			timeoutMinutes,
		]);
	}

	/**
	 * Reset a stuck processing item back to pending for retry
	 */
	async resetStuckProcessingItem(
		id: number,
		errorMessage: string
	): Promise<void> {
		const sql = `
      UPDATE entity_extraction_queue
      SET status = 'pending',
          last_error = ?,
          error_code = 'PROCESSING_TIMEOUT',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
		await this.execute(sql, [errorMessage, id]);
	}
}
