import { getDAOFactory } from "@/dao/dao-factory";
import { LlmBatchJobDAO } from "@/dao/llm-batch-job-dao";
import { buildStructuredCacheablePrefix } from "@/lib/llm-structured-output";
import { LLM_SPEND_INTENT } from "@/lib/llm-usage-intents";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import type {
	ChunkBatchDecision,
	ChunkBatchPlan,
	EntityExtractionBatchCoordinator,
} from "@/services/campaign/entity-extraction-batch-coordinator";
import { AnthropicBatchProvider } from "@/services/llm/anthropic-batch-provider";
import {
	batchDeadlineFrom,
	LLM_BATCH_MIN_REQUESTS,
	LLM_BATCH_SUBMITTING_TIMEOUT_MINUTES,
	parseBatchTimestampMs,
} from "@/services/llm/llm-batch-config";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";
import {
	buildExtractionPromptParts,
	extractionModelId,
	MAX_EXTRACTION_RESPONSE_TOKENS,
	parseExtractionResponseText,
} from "@/services/rag/entity-extraction-service";
import {
	LLM_BATCH_OWNER_KIND,
	type LlmBatchJobRow,
	type LlmBatchRequestInput,
	type LlmBatchRequestRef,
} from "@/types/llm-batch";

/** Status the coordinator reports so the caller can keep the UI honest. */
export type BatchCoordinatorStatus =
	| {
			kind: "awaiting";
			chunkCount: number;
			submittedAt: string;
			justSubmitted: boolean;
	  }
	| { kind: "collected"; servedChunks: number; fallbackChunks: number }
	| { kind: "inline"; reason: string };

export interface EntityExtractionBatchCoordinatorContext {
	env: Env;
	username: string;
	/** Owner key — the library file this discovery job belongs to. */
	fileKey: string;
	llmApiKey: string;
	/**
	 * Content identity at submit time. A batch is only collected against the same
	 * fingerprint it was submitted for; otherwise the chunk boundaries it was
	 * built from may no longer exist and the results are discarded.
	 */
	contentFingerprint: string | null;
	onStatus?: (status: BatchCoordinatorStatus) => Promise<void> | void;
}

/**
 * Routes entity-extraction chunks through the Anthropic Message Batches API
 * (issue #735).
 *
 * The whole point is that this runs across *several* Worker invocations: one
 * cron tick submits, later ticks poll, and the tick that finds the batch ended
 * hands the payloads back to staging. Everything here is therefore written to
 * be safely re-entrant, and every failure path returns `inline` so a batch
 * problem degrades to the current synchronous behavior instead of stalling a
 * user's indexing.
 */
export class EntityExtractionBatchService
	implements EntityExtractionBatchCoordinator
{
	private readonly dao: LlmBatchJobDAO;

	constructor(
		private readonly ctx: EntityExtractionBatchCoordinatorContext,
		private readonly provider = new AnthropicBatchProvider(ctx.llmApiKey)
	) {
		this.dao = new LlmBatchJobDAO(ctx.env.DB);
	}

	/**
	 * Cheap "is this job still waiting on a batch?" check, answerable without a
	 * chunk plan — so a caller can skip the expensive pre-extraction work
	 * (content extraction, character-sheet detection) on a tick where there is
	 * nothing to do but wait.
	 *
	 * This matters a lot: the staging pipeline runs 1–3 interactive LLM calls for
	 * character-sheet detection before it ever plans chunks. Reaching the batch
	 * seam through staging on every poll would repeat those calls once per cron
	 * tick for the life of the batch, charging the interactive budget for work
	 * that is already paid for — enough to cancel out the batch discount.
	 *
	 * Only "a batch exists and has not ended" counts as waiting. Deadline and
	 * plan-mismatch handling needs the plan, so it stays in
	 * {@link resolveChunkOutputs}.
	 */
	async peekPendingBatch(): Promise<{
		waiting: boolean;
		chunkCount?: number;
		submittedAt?: string;
	}> {
		if (!(await this.dao.isSchemaReady())) {
			return { waiting: false };
		}
		const row = await this.dao.getActiveForOwner(
			LLM_BATCH_OWNER_KIND.library_entity_discovery,
			this.ctx.fileKey
		);
		if (!row) {
			return { waiting: false };
		}
		// Past its deadline, or missing an id: resolveChunkOutputs must run so it
		// can cancel, mark the row, and fall back inline.
		if (this.pastDeadline(row) || !row.provider_batch_id) {
			return { waiting: false };
		}
		// Mid-submit by another invocation — wait rather than racing it.
		if (row.status === "submitting") {
			const createdMs = parseBatchTimestampMs(row.created_at);
			const ageMinutes =
				createdMs === null
					? Number.POSITIVE_INFINITY
					: (Date.now() - createdMs) / 60_000;
			return ageMinutes >= LLM_BATCH_SUBMITTING_TIMEOUT_MINUTES
				? { waiting: false }
				: {
						waiting: true,
						chunkCount: row.request_count,
						submittedAt: row.created_at,
					};
		}

		try {
			const status = await this.provider.getBatchStatus(row.provider_batch_id);
			await this.dao.recordPoll(row.id, {
				succeeded: status.counts.succeeded,
				errored: status.counts.errored,
			});
			if (status.processingStatus === "ended") {
				return { waiting: false };
			}
			return {
				waiting: true,
				chunkCount: row.request_count,
				submittedAt: row.created_at,
			};
		} catch (error) {
			// Let resolveChunkOutputs deal with it (and fall back inline).
			createLogger(this.ctx.env, "[EntityExtractionBatch]").warn(
				"batch_peek_failed",
				{
					fileKey: this.ctx.fileKey,
					error: error instanceof Error ? error.message : String(error),
				}
			);
			return { waiting: false };
		}
	}

	async resolveChunkOutputs(plan: ChunkBatchPlan): Promise<ChunkBatchDecision> {
		const log = createLogger(this.ctx.env, "[EntityExtractionBatch]");

		if (!(await this.dao.isSchemaReady())) {
			return this.inline("batch_table_missing");
		}

		const existing = await this.dao.getActiveForOwner(
			LLM_BATCH_OWNER_KIND.library_entity_discovery,
			this.ctx.fileKey
		);

		if (existing) {
			try {
				return await this.resolveExisting(existing, plan);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				log.error("batch_resolve_failed", {
					fileKey: this.ctx.fileKey,
					batchId: existing.id,
					error: message,
				});
				// Free the slot so the next tick can either resubmit or run inline
				// rather than getting stuck behind an unresolvable batch.
				await this.dao.markTerminal(existing.id, "failed", message);
				return this.inline("batch_resolve_failed");
			}
		}

		return this.trySubmit(plan);
	}

	/** Poll (and possibly collect) a batch submitted by an earlier invocation. */
	private async resolveExisting(
		row: LlmBatchJobRow,
		plan: ChunkBatchPlan
	): Promise<ChunkBatchDecision> {
		const log = createLogger(this.ctx.env, "[EntityExtractionBatch]");

		// A row still in `submitting` means the invocation that created it died
		// before recording a provider batch id. Nothing can be collected from it.
		if (row.status === "submitting") {
			const createdMs = parseBatchTimestampMs(row.created_at);
			// Unparseable timestamp: treat as abandoned. Freeing the slot costs at
			// worst a duplicate batch, whereas waiting forever would wedge indexing.
			const ageMinutes =
				createdMs === null
					? Number.POSITIVE_INFINITY
					: (Date.now() - createdMs) / 60_000;
			if (ageMinutes >= LLM_BATCH_SUBMITTING_TIMEOUT_MINUTES) {
				await this.dao.markTerminal(
					row.id,
					"failed",
					"Submit did not complete (worker lost mid-submit)"
				);
				return this.inline("stale_submitting_row");
			}
			// Another invocation may still be mid-submit; do not race it.
			return this.awaiting(row, false);
		}

		if (!row.provider_batch_id) {
			await this.dao.markTerminal(
				row.id,
				"failed",
				"Missing provider batch id"
			);
			return this.inline("missing_provider_batch_id");
		}

		// Content changed under us, or the resume window moved: the stored chunk
		// boundaries no longer describe `plan`, so results cannot be trusted.
		if (!this.planMatches(row, plan)) {
			log.warn("batch_plan_mismatch", {
				fileKey: this.ctx.fileKey,
				batchId: row.id,
			});
			await this.cancelQuietly(row.provider_batch_id);
			await this.dao.markTerminal(
				row.id,
				"canceled",
				"Chunk window or content fingerprint changed since submission"
			);
			return this.inline("plan_mismatch");
		}

		if (this.pastDeadline(row)) {
			log.warn("batch_deadline_exceeded", {
				fileKey: this.ctx.fileKey,
				batchId: row.id,
				deadlineAt: row.deadline_at,
			});
			await this.cancelQuietly(row.provider_batch_id);
			await this.dao.markTerminal(
				row.id,
				"expired",
				`Batch exceeded its ${row.deadline_at} deadline; falling back to inline extraction`
			);
			return this.inline("deadline_exceeded");
		}

		const status = await this.provider.getBatchStatus(row.provider_batch_id);
		await this.dao.recordPoll(row.id, {
			succeeded: status.counts.succeeded,
			errored: status.counts.errored,
		});

		if (status.processingStatus !== "ended") {
			return this.awaiting(row, false);
		}

		return this.collect(row, plan);
	}

	/** Read an ended batch's results and map them back onto chunk indexes. */
	private async collect(
		row: LlmBatchJobRow,
		plan: ChunkBatchPlan
	): Promise<ChunkBatchDecision> {
		const log = createLogger(this.ctx.env, "[EntityExtractionBatch]");
		const refs = LlmBatchJobDAO.parseRequests(row);
		const chunkIndexByCustomId = new Map<string, number>(
			refs.map((ref: LlmBatchRequestRef) => [ref.customId, ref.chunkIndex])
		);
		const plannedIndexes = new Set(plan.chunks.map((c) => c.globalIndex));

		const results = await this.provider.getBatchResults(row.provider_batch_id!);

		const outputsByChunkIndex = new Map<number, unknown>();
		let inputTokens = 0;
		let outputTokens = 0;
		let cachedInputTokens = 0;
		let cacheWriteTokens = 0;
		const failedChunkIndexes: number[] = [];

		for (const result of results) {
			// Results arrive in arbitrary order — always key by custom_id.
			const chunkIndex = chunkIndexByCustomId.get(result.customId);
			if (chunkIndex === undefined || !plannedIndexes.has(chunkIndex)) {
				continue;
			}

			if (result.outcome !== "succeeded") {
				failedChunkIndexes.push(chunkIndex);
				continue;
			}

			inputTokens += result.inputTokens;
			outputTokens += result.outputTokens;
			cachedInputTokens += result.cachedInputTokens;
			cacheWriteTokens += result.cacheWriteTokens;

			let payload: unknown = null;
			try {
				payload = parseExtractionResponseText(result.text);
			} catch (error) {
				log.warn("batch_result_unparseable", {
					fileKey: this.ctx.fileKey,
					chunkIndex,
					error: error instanceof Error ? error.message : String(error),
				});
				payload = null;
			}
			if (payload === null) {
				// No usable JSON: re-extract this chunk inline (where a JSON repair
				// pass is available) rather than silently dropping its entities.
				failedChunkIndexes.push(chunkIndex);
				continue;
			}
			outputsByChunkIndex.set(chunkIndex, payload);
		}

		await this.recordBatchSpend(row, {
			inputTokens,
			outputTokens,
			cachedInputTokens,
			cacheWriteTokens,
		});
		await this.dao.markCollected(row.id, { inputTokens, outputTokens });

		const fallbackChunks = plan.chunks.length - outputsByChunkIndex.size;
		log.info("batch_collected", {
			fileKey: this.ctx.fileKey,
			batchId: row.id,
			servedChunks: outputsByChunkIndex.size,
			fallbackChunks,
			failedChunkIndexes,
			inputTokens,
			outputTokens,
		});
		await this.ctx.onStatus?.({
			kind: "collected",
			servedChunks: outputsByChunkIndex.size,
			fallbackChunks,
		});

		// Chunks missing from the map fall through to an inline call in staging, so
		// a partly-failed batch costs only the requests that actually failed.
		return { status: "ready", outputsByChunkIndex };
	}

	/** Submit this run's chunks as one batch, or decline and stay inline. */
	private async trySubmit(plan: ChunkBatchPlan): Promise<ChunkBatchDecision> {
		const log = createLogger(this.ctx.env, "[EntityExtractionBatch]");

		if (plan.chunks.length < LLM_BATCH_MIN_REQUESTS) {
			return this.inline("below_min_batch_size");
		}

		const rateLimitService = getLLMRateLimitService(this.ctx.env);
		const budget = await rateLimitService.checkBatchRequestBudget(
			this.ctx.username,
			plan.chunks.length
		);
		if (!budget.allowed) {
			log.info("batch_budget_declined", {
				fileKey: this.ctx.fileKey,
				reason: budget.reason,
			});
			return this.inline("batch_budget_exhausted");
		}

		const model = extractionModelId();
		const jobId = crypto.randomUUID();
		const requests: LlmBatchRequestInput[] = [];
		const refs: LlmBatchRequestRef[] = [];

		for (const planned of plan.chunks) {
			const customId = `chunk-${planned.globalIndex}`;
			const parts = buildExtractionPromptParts(plan.sourceName, planned.chunk);
			requests.push({
				customId,
				// Byte-identical across every request in the batch, so the shared
				// extraction instructions cache after the first one.
				cacheablePrefix: buildStructuredCacheablePrefix(parts.cacheablePrefix),
				variableSuffix: parts.variableSuffix,
				maxTokens: MAX_EXTRACTION_RESPONSE_TOKENS,
			});
			refs.push({ customId, chunkIndex: planned.globalIndex });
		}

		// Claim the owner's single-flight slot before talking to Anthropic: if two
		// cron ticks race, the loser gets null here and never submits.
		const claimed = await this.dao.createSubmitting({
			id: jobId,
			provider: "anthropic",
			ownerKind: LLM_BATCH_OWNER_KIND.library_entity_discovery,
			ownerKey: this.ctx.fileKey,
			username: this.ctx.username,
			model,
			requests: refs,
			contentFingerprint: this.ctx.contentFingerprint,
			chunkWindowStart: plan.chunkWindowStart,
			chunkWindowEnd: plan.chunkWindowEnd,
			totalChunks: plan.totalChunks,
			deadlineAt: batchDeadlineFrom(new Date()),
		});
		if (!claimed) {
			return this.inline("owner_slot_taken");
		}

		try {
			const submitted = await this.provider.submitBatch(requests, { model });
			await this.dao.markInProgress(claimed.id, submitted.providerBatchId);
			log.info("batch_submitted", {
				fileKey: this.ctx.fileKey,
				batchId: claimed.id,
				providerBatchId: submitted.providerBatchId,
				requestCount: submitted.requestCount,
				model,
			});
			return this.awaiting(claimed, true);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.error("batch_submit_failed", {
				fileKey: this.ctx.fileKey,
				batchId: claimed.id,
				error: message,
			});
			await this.dao.markTerminal(claimed.id, "failed", message);
			return this.inline("submit_failed");
		}
	}

	/**
	 * Batch token spend is recorded once, when results are collected, and not
	 * charged against the interactive query budget — see
	 * {@link import("./llm-rate-limit-service").LLMRateLimitService.recordBatchUsage}.
	 *
	 * The input/output split is passed through rather than just the total: cost
	 * attribution prices output at roughly 5x input, and cache reads at a tenth
	 * of it, so a total-only record is stored unpriced and batch spend would be
	 * missing from the very dashboard that reports it.
	 */
	private async recordBatchSpend(
		row: LlmBatchJobRow,
		usage: {
			inputTokens: number;
			outputTokens: number;
			cachedInputTokens: number;
			cacheWriteTokens: number;
		}
	): Promise<void> {
		const tokens = usage.inputTokens + usage.outputTokens;
		if (tokens <= 0) {
			return;
		}
		try {
			await getLLMRateLimitService(this.ctx.env).recordBatchUsage(
				this.ctx.username,
				tokens,
				row.model,
				{
					intent: LLM_SPEND_INTENT.entity_extraction,
					source: "entity_extraction_batch:collect",
					// `inputTokens` is the all-in figure; promptTokens is the uncached
					// remainder, so the three input lines sum to it without double-count.
					promptTokens: Math.max(
						0,
						usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens
					),
					completionTokens: usage.outputTokens,
					cachedInputTokens: usage.cachedInputTokens,
					cacheWriteTokens: usage.cacheWriteTokens,
					phase: "extract_entities",
					fileKey: this.ctx.fileKey,
					batchRequestCount: row.request_count,
					providerBatchId: row.provider_batch_id ?? undefined,
				}
			);
		} catch (error) {
			createLogger(this.ctx.env, "[EntityExtractionBatch]").error(
				"batch_usage_record_failed",
				error
			);
		}
	}

	private planMatches(row: LlmBatchJobRow, plan: ChunkBatchPlan): boolean {
		if (row.content_fingerprint !== this.ctx.contentFingerprint) {
			return false;
		}
		return (
			row.chunk_window_start === plan.chunkWindowStart &&
			row.chunk_window_end === plan.chunkWindowEnd &&
			row.total_chunks === plan.totalChunks
		);
	}

	private pastDeadline(row: LlmBatchJobRow): boolean {
		const deadline = parseBatchTimestampMs(row.deadline_at);
		if (deadline === null) {
			// Without a readable deadline the cron sweep is the backstop; do not
			// expire a batch that may still be running.
			return false;
		}
		return Date.now() > deadline;
	}

	private async cancelQuietly(providerBatchId: string): Promise<void> {
		try {
			await this.provider.cancelBatch(providerBatchId);
		} catch {
			// Cancellation is best effort — an uncancelable batch just expires.
		}
	}

	private async awaiting(
		row: LlmBatchJobRow,
		justSubmitted: boolean
	): Promise<ChunkBatchDecision> {
		const submittedAt = row.created_at;
		await this.ctx.onStatus?.({
			kind: "awaiting",
			chunkCount: row.request_count,
			submittedAt,
			justSubmitted,
		});
		return {
			status: "awaiting",
			detail: `batch ${row.id} (${row.request_count} requests)`,
		};
	}

	private async inline(reason: string): Promise<ChunkBatchDecision> {
		await this.ctx.onStatus?.({ kind: "inline", reason });
		return { status: "inline", reason };
	}
}

/**
 * Sweep batch rows that can never resolve so their owners are not blocked:
 * rows abandoned mid-submit, and in-flight rows past their deadline. Called
 * from the fast cron alongside the other queue maintenance.
 */
export async function cleanupStaleBatchJobs(env: Env): Promise<{
	failedSubmitting: number;
	expired: number;
}> {
	const dao = getDAOFactory(env).llmBatchJobDAO;
	if (!(await dao.isSchemaReady())) {
		return { failedSubmitting: 0, expired: 0 };
	}
	const log = createLogger(env, "[EntityExtractionBatch]");

	const stale = await dao.getStaleSubmitting(
		LLM_BATCH_SUBMITTING_TIMEOUT_MINUTES
	);
	for (const row of stale) {
		await dao.markTerminal(
			row.id,
			"failed",
			"Submit did not complete (worker lost mid-submit)"
		);
	}

	const overdue = await dao.getPastDeadline();
	for (const row of overdue) {
		await dao.markTerminal(
			row.id,
			"expired",
			`Batch exceeded its ${row.deadline_at} deadline`
		);
	}

	if (stale.length > 0 || overdue.length > 0) {
		log.info("batch_stale_cleanup", {
			failedSubmitting: stale.length,
			expired: overdue.length,
		});
	}
	return { failedSubmitting: stale.length, expired: overdue.length };
}
