import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import { getSubscriptionService } from "@/services/billing/subscription-service";

export interface CheckLimitResult {
	allowed: boolean;
	reason?: string;
	nextResetAt?: string;
	limitType?: "minute" | "daily";
}

export interface UsageStatus {
	tpm: number;
	qpm: number;
	tpd: number;
	qpd: number;
	tpmLimit: number;
	qpmLimit: number;
	tpdLimit: number;
	qpdLimit: number;
	nextResetAt: string | null;
	atLimit: boolean;
	limitType?: "minute" | "daily";
	isAdmin: boolean;
	/** Monthly usage (free tier only) */
	monthlyUsage?: number;
	/** Effective monthly limit including credits (free tier only) */
	monthlyLimit?: number;
	/** One-time credits remaining (free tier only) */
	creditsRemaining?: number;
}

export interface CheckIndexingQuotaResult {
	allowed: boolean;
	reason?: string;
	wouldExceed?: boolean;
	monthlyUsage?: number;
	monthlyLimit?: number;
	creditsRemaining?: number;
	nextResetAt?: string;
}

function addSeconds(isoOrSqlite: string, seconds: number): string {
	const d = new Date(isoOrSqlite.replace(" ", "T"));
	d.setSeconds(d.getSeconds() + seconds);
	return d.toISOString();
}

function addHours(isoOrSqlite: string, hours: number): string {
	const d = new Date(isoOrSqlite.replace(" ", "T"));
	d.setHours(d.getHours() + hours);
	return d.toISOString();
}

export class LLMRateLimitService {
	constructor(private env: Env) {}

	async checkLimit(
		username: string,
		isAdmin: boolean
	): Promise<CheckLimitResult> {
		if (isAdmin) {
			return { allowed: true };
		}

		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username);
		const limits = subService.getTierLimits(tier);

		// Free tier: check monthly token cap (base + credits)
		if (limits.monthlyTokens !== undefined) {
			const dao = getDAOFactory(this.env);
			const [monthlyUsage, creditsRemaining] = await Promise.all([
				dao.userMonthlyUsageDAO.getCurrentMonthUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			const effectiveLimit = limits.monthlyTokens + creditsRemaining;
			if (monthlyUsage >= effectiveLimit) {
				return {
					allowed: false,
					reason: `Monthly token limit (${effectiveLimit.toLocaleString()}) exceeded. Upgrade or purchase credits for more.`,
					nextResetAt: new Date(
						new Date().getFullYear(),
						new Date().getMonth() + 1,
						1
					).toISOString(),
					limitType: "daily",
				};
			}
		}

		const dao = getDAOFactory(this.env).llmUsageDAO;
		const [minute, daily] = await Promise.all([
			dao.getUsageInLastMinute(username),
			dao.getUsageInLast24Hours(username),
		]);

		const tpmLimit = limits.tpm;
		const qpmLimit = limits.qpm;
		const tpdLimit = limits.tpd;
		const qpdLimit = limits.qpd;

		const tpm = (minute as { tpm?: number }).tpm ?? 0;
		const qpm = (minute as { qpm?: number }).qpm ?? 0;
		const tpd = (daily as { tpd?: number }).tpd ?? 0;
		const qpd = (daily as { qpd?: number }).qpd ?? 0;

		// Check per-minute limits first
		if (tpm >= tpmLimit) {
			const oldestAt = (minute as { oldestAt?: string | null }).oldestAt;
			const nextResetAt = oldestAt
				? addSeconds(oldestAt, 60)
				: new Date(Date.now() + 60_000).toISOString();
			return {
				allowed: false,
				reason: `Token limit (${tpmLimit.toLocaleString()} per minute) exceeded. Try again after the window resets.`,
				nextResetAt,
				limitType: "minute",
			};
		}
		if (qpm >= qpmLimit) {
			const oldestAt = (minute as { oldestAt?: string | null }).oldestAt;
			const nextResetAt = oldestAt
				? addSeconds(oldestAt, 60)
				: new Date(Date.now() + 60_000).toISOString();
			return {
				allowed: false,
				reason: `Query limit (${qpmLimit} per minute) exceeded. Try again after the window resets.`,
				nextResetAt,
				limitType: "minute",
			};
		}

		// Check daily limits
		if (tpd >= tpdLimit) {
			const oldestAt = (daily as { oldestAt?: string | null }).oldestAt;
			const nextResetAt = oldestAt
				? addHours(oldestAt, 24)
				: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
			return {
				allowed: false,
				reason: `Daily token limit (${tpdLimit.toLocaleString()}) exceeded. Resets in ~24 hours.`,
				nextResetAt,
				limitType: "daily",
			};
		}
		if (qpd >= qpdLimit) {
			const oldestAt = (daily as { oldestAt?: string | null }).oldestAt;
			const nextResetAt = oldestAt
				? addHours(oldestAt, 24)
				: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
			return {
				allowed: false,
				reason: `Daily query limit (${qpdLimit}) exceeded. Resets in ~24 hours.`,
				nextResetAt,
				limitType: "daily",
			};
		}

		return { allowed: true };
	}

	/**
	 * Check if an indexing action (e.g. add resource) would exceed quota.
	 * For free tier, checks monthly cap + credits. For paid tiers, delegates to checkLimit.
	 */
	async checkIndexingQuota(
		username: string,
		isAdmin: boolean,
		estimatedTokens: number = 5_000
	): Promise<CheckIndexingQuotaResult> {
		if (isAdmin) {
			return { allowed: true };
		}

		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username);
		const limits = subService.getTierLimits(tier);

		// Free tier: check monthly cap with estimated tokens
		if (limits.monthlyTokens !== undefined) {
			const dao = getDAOFactory(this.env);
			const [monthlyUsage, creditsRemaining] = await Promise.all([
				dao.userMonthlyUsageDAO.getCurrentMonthUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			const effectiveLimit = limits.monthlyTokens + creditsRemaining;
			const wouldExceed = monthlyUsage + estimatedTokens > effectiveLimit;
			const alreadyExceeded = monthlyUsage >= effectiveLimit;

			if (alreadyExceeded) {
				return {
					allowed: false,
					reason: `Monthly token limit (${effectiveLimit.toLocaleString()}) exceeded. Purchase credits or upgrade for more.`,
					wouldExceed: true,
					monthlyUsage,
					monthlyLimit: effectiveLimit,
					creditsRemaining,
					nextResetAt: new Date(
						new Date().getFullYear(),
						new Date().getMonth() + 1,
						1
					).toISOString(),
				};
			}
			if (wouldExceed) {
				return {
					allowed: false,
					reason: `This action would exceed your monthly token limit. You have ${(effectiveLimit - monthlyUsage).toLocaleString()} tokens remaining.`,
					wouldExceed: true,
					monthlyUsage,
					monthlyLimit: effectiveLimit,
					creditsRemaining,
					nextResetAt: new Date(
						new Date().getFullYear(),
						new Date().getMonth() + 1,
						1
					).toISOString(),
				};
			}
			return {
				allowed: true,
				monthlyUsage,
				monthlyLimit: effectiveLimit,
				creditsRemaining,
			};
		}

		// Paid tiers: use standard rate limit check
		const result = await this.checkLimit(username, isAdmin);
		return {
			allowed: result.allowed,
			reason: result.reason,
			nextResetAt: result.nextResetAt,
		};
	}

	async recordUsage(
		username: string,
		tokens: number,
		queryCount: number,
		model?: string
	): Promise<void> {
		const dao = getDAOFactory(this.env);
		await dao.llmUsageDAO.insertUsage(username, tokens, queryCount, model);

		// Free tier: track monthly usage for cap
		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username);
		const limits = subService.getTierLimits(tier);
		if (limits.monthlyTokens !== undefined) {
			await dao.userMonthlyUsageDAO.incrementUsage(username, tokens);
		}
	}

	async getUsageStatus(
		username: string,
		isAdmin: boolean
	): Promise<UsageStatus> {
		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username);
		const limits = subService.getTierLimits(tier);
		const tpmLimit = limits.tpm;
		const qpmLimit = limits.qpm;
		const tpdLimit = limits.tpd;
		const qpdLimit = limits.qpd;

		if (isAdmin) {
			return {
				tpm: 0,
				qpm: 0,
				tpd: 0,
				qpd: 0,
				tpmLimit,
				qpmLimit,
				tpdLimit,
				qpdLimit,
				nextResetAt: null,
				atLimit: false,
				isAdmin: true,
			};
		}

		const dao = getDAOFactory(this.env);

		// Free tier: include monthly usage and credits for UI
		let monthlyUsage: number | undefined;
		let monthlyLimit: number | undefined;
		let creditsRemaining: number | undefined;
		if (limits.monthlyTokens !== undefined) {
			[monthlyUsage, creditsRemaining] = await Promise.all([
				dao.userMonthlyUsageDAO.getCurrentMonthUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			monthlyLimit = limits.monthlyTokens + creditsRemaining;
		}

		const [minute, daily] = await Promise.all([
			dao.llmUsageDAO.getUsageInLastMinute(username),
			dao.llmUsageDAO.getUsageInLast24Hours(username),
		]);

		const tpm = (minute as { tpm?: number }).tpm ?? 0;
		const qpm = (minute as { qpm?: number }).qpm ?? 0;
		const tpd = (daily as { tpd?: number }).tpd ?? 0;
		const qpd = (daily as { qpd?: number }).qpd ?? 0;

		// Compute next reset (sooner of minute or daily)
		let nextResetAt: string | null = null;
		let limitType: "minute" | "daily" | undefined;

		const minuteOldest = (minute as { oldestAt?: string | null }).oldestAt;
		const dailyOldest = (daily as { oldestAt?: string | null }).oldestAt;

		const minuteReset = minuteOldest ? addSeconds(minuteOldest, 60) : null;
		const dailyReset = dailyOldest ? addHours(dailyOldest, 24) : null;

		const atMinuteLimit = tpm >= tpmLimit || qpm >= qpmLimit;
		const atDailyLimit = tpd >= tpdLimit || qpd >= qpdLimit;

		if (atMinuteLimit && atDailyLimit) {
			const minDate = [minuteReset, dailyReset]
				.filter(Boolean)
				.map((s) => new Date(s!));
			nextResetAt =
				minDate.length > 0
					? new Date(Math.min(...minDate.map((d) => d.getTime()))).toISOString()
					: null;
			limitType = "minute"; // Prefer showing minute reset since it's sooner
		} else if (atMinuteLimit && minuteReset) {
			nextResetAt = minuteReset;
			limitType = "minute";
		} else if (atDailyLimit && dailyReset) {
			nextResetAt = dailyReset;
			limitType = "daily";
		} else if (minuteOldest || dailyOldest) {
			// Not at limit but show when next capacity frees (oldest event + window)
			const resets: string[] = [];
			if (minuteOldest) resets.push(addSeconds(minuteOldest, 60));
			if (dailyOldest) resets.push(addHours(dailyOldest, 24));
			nextResetAt =
				resets.length > 0
					? new Date(
							Math.min(...resets.map((s) => new Date(s).getTime()))
						).toISOString()
					: null;
		}

		// Free tier: also at limit if monthly cap exceeded
		const atMonthlyLimit =
			monthlyLimit !== undefined &&
			monthlyUsage !== undefined &&
			monthlyUsage >= monthlyLimit;

		return {
			tpm,
			qpm,
			tpd,
			qpd,
			tpmLimit,
			qpmLimit,
			tpdLimit,
			qpdLimit,
			nextResetAt:
				atMonthlyLimit && limits.monthlyTokens !== undefined
					? new Date(
							new Date().getFullYear(),
							new Date().getMonth() + 1,
							1
						).toISOString()
					: nextResetAt,
			atLimit: atMinuteLimit || atDailyLimit || atMonthlyLimit,
			limitType: atMonthlyLimit ? "daily" : limitType,
			isAdmin: false,
			monthlyUsage,
			monthlyLimit,
			creditsRemaining,
		};
	}
}

export function getLLMRateLimitService(env: Env): LLMRateLimitService {
	return new LLMRateLimitService(env);
}
