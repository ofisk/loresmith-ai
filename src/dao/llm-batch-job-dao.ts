import { BaseDAOClass } from "@/dao/base-dao";
import type {
	LlmBatchJobRow,
	LlmBatchRequestRef,
	LlmBatchStatus,
} from "@/types/llm-batch";

/** Statuses a batch can still move out of (i.e. it occupies its owner slot). */
const ACTIVE_STATUSES: LlmBatchStatus[] = ["submitting", "in_progress"];

export interface CreateLlmBatchJobInput {
	id: string;
	provider: string;
	ownerKind: string;
	ownerKey: string;
	username: string;
	model: string;
	requests: LlmBatchRequestRef[];
	contentFingerprint: string | null;
	chunkWindowStart: number;
	chunkWindowEnd: number;
	totalChunks: number;
	deadlineAt: string;
}

/**
 * Persistence for in-flight Anthropic message batches (issue #735).
 *
 * Every method is a no-op / empty result when the table is absent so a Worker
 * deployed ahead of its migration degrades to the synchronous extraction path
 * instead of throwing on every cron tick.
 */
export class LlmBatchJobDAO extends BaseDAOClass {
	async isSchemaReady(): Promise<boolean> {
		return this.hasTable("llm_batch_jobs");
	}

	/**
	 * Claim the owner's batch slot. Returns null when the owner already has a
	 * non-terminal batch (the partial unique index rejects the insert), which is
	 * how concurrent cron ticks avoid submitting the same work twice.
	 */
	async createSubmitting(
		input: CreateLlmBatchJobInput
	): Promise<LlmBatchJobRow | null> {
		const sql = `
      INSERT OR IGNORE INTO llm_batch_jobs (
        id, provider, owner_kind, owner_key, username, model, status,
        request_count, requests, content_fingerprint,
        chunk_window_start, chunk_window_end, total_chunks, deadline_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'submitting', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
		const changes = await this.executeReturningChanges(sql, [
			input.id,
			input.provider,
			input.ownerKind,
			input.ownerKey,
			input.username,
			input.model,
			input.requests.length,
			JSON.stringify(input.requests),
			input.contentFingerprint,
			input.chunkWindowStart,
			input.chunkWindowEnd,
			input.totalChunks,
			input.deadlineAt,
		]);
		if (changes === 0) {
			return null;
		}
		return this.getById(input.id);
	}

	async getById(id: string): Promise<LlmBatchJobRow | null> {
		return this.queryFirst<LlmBatchJobRow>(
			`SELECT * FROM llm_batch_jobs WHERE id = ?`,
			[id]
		);
	}

	/** The owner's in-flight batch, if any. */
	async getActiveForOwner(
		ownerKind: string,
		ownerKey: string
	): Promise<LlmBatchJobRow | null> {
		const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
		return this.queryFirst<LlmBatchJobRow>(
			`SELECT * FROM llm_batch_jobs
       WHERE owner_kind = ? AND owner_key = ? AND status IN (${placeholders})
       ORDER BY created_at DESC LIMIT 1`,
			[ownerKind, ownerKey, ...ACTIVE_STATUSES]
		);
	}

	async markInProgress(id: string, providerBatchId: string): Promise<void> {
		await this.execute(
			`UPDATE llm_batch_jobs
       SET status = 'in_progress', provider_batch_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
			[providerBatchId, id]
		);
	}

	async recordPoll(
		id: string,
		counts: { succeeded: number; errored: number }
	): Promise<void> {
		await this.execute(
			`UPDATE llm_batch_jobs
       SET last_polled_at = datetime('now'),
           poll_count = poll_count + 1,
           succeeded_count = ?,
           errored_count = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
			[counts.succeeded, counts.errored, id]
		);
	}

	async markCollected(
		id: string,
		usage: { inputTokens: number; outputTokens: number }
	): Promise<void> {
		await this.execute(
			`UPDATE llm_batch_jobs
       SET status = 'collected',
           input_tokens = ?,
           output_tokens = ?,
           completed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
			[usage.inputTokens, usage.outputTokens, id]
		);
	}

	async markTerminal(
		id: string,
		status: Extract<LlmBatchStatus, "failed" | "expired" | "canceled">,
		error?: string
	): Promise<void> {
		await this.execute(
			`UPDATE llm_batch_jobs
       SET status = ?, last_error = ?, completed_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
			[status, error ?? null, id]
		);
	}

	/**
	 * Batch requests submitted by a user within the last `windowSeconds`.
	 * Backs the separate batch-request budget line (see
	 * {@link import("@/config/anthropic-org-rate-budget").deriveBatchRequestBudget}),
	 * so batch work is not charged against the interactive RPM share.
	 */
	async getRequestCountSince(
		username: string,
		windowSeconds: number
	): Promise<number> {
		const row = await this.queryFirst<{ total: number | null }>(
			`SELECT SUM(request_count) AS total FROM llm_batch_jobs
       WHERE username = ? AND created_at >= datetime('now', ?)`,
			[username, `-${Math.max(1, Math.floor(windowSeconds))} seconds`]
		);
		return row?.total ?? 0;
	}

	/**
	 * Rows stuck in `submitting` past `timeoutMinutes` — a submit that died
	 * before the provider batch id was written. Nothing was necessarily sent, so
	 * these are failed (not expired) and the owner is freed to retry inline.
	 */
	async getStaleSubmitting(timeoutMinutes: number): Promise<LlmBatchJobRow[]> {
		return this.queryAll<LlmBatchJobRow>(
			`SELECT * FROM llm_batch_jobs
       WHERE status = 'submitting'
         AND created_at <= datetime('now', ?)`,
			[`-${Math.max(1, Math.floor(timeoutMinutes))} minutes`]
		);
	}

	/** In-flight batches whose deadline has passed. */
	async getPastDeadline(): Promise<LlmBatchJobRow[]> {
		const placeholders = ACTIVE_STATUSES.map(() => "?").join(", ");
		return this.queryAll<LlmBatchJobRow>(
			`SELECT * FROM llm_batch_jobs
       WHERE status IN (${placeholders}) AND deadline_at <= datetime('now')`,
			ACTIVE_STATUSES
		);
	}

	/** Parses the stored request mapping; `[]` when the column is unreadable. */
	static parseRequests(row: LlmBatchJobRow): LlmBatchRequestRef[] {
		try {
			const parsed = JSON.parse(row.requests);
			if (!Array.isArray(parsed)) {
				return [];
			}
			return parsed.filter(
				(entry): entry is LlmBatchRequestRef =>
					!!entry &&
					typeof entry === "object" &&
					typeof (entry as LlmBatchRequestRef).customId === "string" &&
					Number.isInteger((entry as LlmBatchRequestRef).chunkIndex)
			);
		} catch {
			return [];
		}
	}
}
