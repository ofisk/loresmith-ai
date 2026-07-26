import { MODEL_CONFIG } from "@/app-constants";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { getEnvVar } from "@/lib/env-utils";

/**
 * Anthropic Message Batches routing for queue-driven pipeline work (issue #735).
 *
 * Off by default: set `LLM_BATCH_EXTRACTION_ENABLED=true` to route library
 * entity discovery through batches. Every guard below degrades to the existing
 * synchronous per-chunk path, so a disabled flag, a missing migration, a failed
 * submit, or a blown deadline all mean "extract inline", never "stop indexing".
 */

/** Below this, a batch's overhead (extra cron round-trips) outweighs the discount. */
export const LLM_BATCH_MIN_REQUESTS = 2;

/**
 * Wall-clock budget for a batch before the owner abandons it and falls back to
 * inline extraction. Anthropic's own ceiling is 24h and most batches finish
 * within an hour; 3h keeps a stuck batch from delaying a user's indexing for a
 * day while still leaving generous room for normal completion.
 */
export const LLM_BATCH_DEADLINE_MINUTES = 180;

/**
 * A row stuck in `submitting` this long lost its worker mid-submit. It is swept
 * to `failed` so the owner's single-flight slot is released.
 */
export const LLM_BATCH_SUBMITTING_TIMEOUT_MINUTES = 15;

/** Window used for the per-user batch-request rate check. */
export const LLM_BATCH_BUDGET_WINDOW_SECONDS = 60;

export async function isBatchExtractionEnabled(
	env: EnvWithSecrets
): Promise<boolean> {
	if (MODEL_CONFIG.PROVIDER.DEFAULT !== "anthropic") {
		return false;
	}
	const raw = await getEnvVar(env, "LLM_BATCH_EXTRACTION_ENABLED", false);
	const value = raw.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

/** ISO timestamp `LLM_BATCH_DEADLINE_MINUTES` from `now`. */
export function batchDeadlineFrom(now: Date): string {
	return new Date(
		now.getTime() + LLM_BATCH_DEADLINE_MINUTES * 60 * 1000
	).toISOString();
}

/**
 * Parse a timestamp off an `llm_batch_jobs` row to epoch ms.
 *
 * The table mixes two formats: `created_at`/`updated_at` are written by D1's
 * `datetime('now')` as bare UTC (`YYYY-MM-DD HH:MM:SS`, no zone), while
 * `deadline_at` is an ISO string from {@link batchDeadlineFrom}. A bare value
 * must be read as UTC — parsing it as local time shifts every comparison by the
 * host's offset, which silently expires or extends batches.
 *
 * Returns null when the value cannot be parsed, so callers decide what a
 * missing timestamp means rather than getting a misleading number.
 */
export function parseBatchTimestampMs(value: string): number | null {
	const trimmed = value.trim();
	const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(
		trimmed
	)
		? `${trimmed.replace(" ", "T")}Z`
		: trimmed.replace(" ", "T");
	const parsed = Date.parse(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}
