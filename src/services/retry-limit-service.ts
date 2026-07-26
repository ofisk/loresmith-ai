import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { getSubscriptionService } from "@/services/billing/subscription-service";

export interface RetryLimitResult {
	allowed: boolean;
	reason?: string;
}

/**
 * Per-file retry caps (`retriesPerFilePerDay` / `retriesPerFilePerMonth`) for
 * user-initiated retries of a file.
 *
 * These count **user retries of a whole file**, not individual model calls, so
 * routing extraction through the Anthropic Message Batches API (issue #735)
 * does not change the accounting — provided a partly-failed batch never
 * surfaces to the user as a failed file. It does not: chunks a batch fails to
 * return are re-extracted inline within the same pipeline run, and a batch that
 * errors, expires, or blows its deadline falls back to the synchronous path
 * without touching either this counter or the discovery job's `retry_count`.
 * See `EntityExtractionBatchService`.
 */
export class RetryLimitService {
	/**
	 * Check if user can retry (read-only, does not increment).
	 * Used by UI to disable retry button with tooltip when limit is reached.
	 */
	static async checkRetryLimit(
		username: string,
		fileKey: string,
		isAdmin: boolean,
		env: { DB: D1Database }
	): Promise<RetryLimitResult> {
		if (isAdmin) {
			return { allowed: true };
		}

		const subService = getSubscriptionService(env as any);
		const tier = await subService.getTier(username, isAdmin);
		const limits = subService.getTierLimits(tier);

		const dailyLimit = limits.retriesPerFilePerDay;
		const monthlyLimit = limits.retriesPerFilePerMonth;

		const fileRetryDAO = getDAOFactory(env).fileRetryUsageDAO;
		const dailyRetries = await fileRetryDAO.getRetriesForFileToday(
			username,
			fileKey
		);
		const monthlyRetries = await fileRetryDAO.getRetriesForFileThisMonth(
			username,
			fileKey
		);

		if (dailyRetries >= dailyLimit) {
			return {
				allowed: false,
				reason: `Daily retry limit (${dailyLimit} per file) reached. Try again tomorrow.`,
			};
		}

		if (monthlyRetries >= monthlyLimit) {
			return {
				allowed: false,
				reason: `Monthly retry limit (${monthlyLimit} per file) reached. Upgrade for more retries.`,
			};
		}

		return { allowed: true };
	}

	static async checkAndIncrementRetry(
		username: string,
		fileKey: string,
		isAdmin: boolean,
		env: { DB: D1Database }
	): Promise<RetryLimitResult> {
		if (isAdmin) {
			return { allowed: true };
		}

		const subService = getSubscriptionService(env as any);
		const tier = await subService.getTier(username, isAdmin);
		const limits = subService.getTierLimits(tier);

		const dailyLimit = limits.retriesPerFilePerDay;
		const monthlyLimit = limits.retriesPerFilePerMonth;

		const fileRetryDAO = getDAOFactory(env).fileRetryUsageDAO;
		const dailyRetries = await fileRetryDAO.getRetriesForFileToday(
			username,
			fileKey
		);
		const monthlyRetries = await fileRetryDAO.getRetriesForFileThisMonth(
			username,
			fileKey
		);

		if (dailyRetries >= dailyLimit) {
			return {
				allowed: false,
				reason: `Daily retry limit (${dailyLimit} per file) reached. Try again tomorrow.`,
			};
		}

		if (monthlyRetries >= monthlyLimit) {
			return {
				allowed: false,
				reason: `Monthly retry limit (${monthlyLimit} per file) reached. Upgrade for more retries.`,
			};
		}

		await fileRetryDAO.incrementRetry(username, fileKey);
		return { allowed: true };
	}
}
