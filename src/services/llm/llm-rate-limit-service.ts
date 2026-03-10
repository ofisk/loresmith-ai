import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";
import { getSubscriptionService } from "@/services/billing/subscription-service";

export interface CheckLimitResult {
	allowed: boolean;
	reason?: string;
	nextResetAt?: string;
	limitType?: "hour" | "daily";
}

export interface UsageStatus {
	tph: number;
	qpm: number;
	tpd: number;
	qpd: number;
	tphLimit: number;
	qpmLimit: number;
	tpdLimit: number;
	qpdLimit: number;
	nextResetAt: string | null;
	atLimit: boolean;
	limitType?: "hour" | "daily";
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

function addHours(isoOrSqlite: string, hours: number): string {
	const d = new Date(isoOrSqlite.replace(" ", "T"));
	d.setHours(d.getHours() + hours);
	return d.toISOString();
}

/** Max extra tokens/day from credits (tenant fairness – prevents one user blocking queue) */
const DAILY_CREDIT_BOOST_CAP = 100_000;
/** Max extra tokens/hour from credits (tenant fairness) */
const HOURLY_CREDIT_BOOST_CAP = 60_000;

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

		let creditsRemaining = 0;
		if (limits.monthlyTokens !== undefined) {
			const dao = getDAOFactory(this.env);
			const [monthlyUsage, credits] = await Promise.all([
				dao.userMonthlyUsageDAO.getCurrentMonthUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			creditsRemaining = credits;
			const effectiveLimit = limits.monthlyTokens + credits;
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
		const [hour, daily] = await Promise.all([
			dao.getUsageInLastHour(username),
			dao.getUsageInLast24Hours(username),
		]);

		// Relax daily/hourly rate when user has credits (let them consume one-offs)
		// Cap boost for tenant fairness – prevents one user from blocking the queue
		const tpdBoost =
			creditsRemaining > 0
				? Math.min(creditsRemaining, DAILY_CREDIT_BOOST_CAP)
				: 0;
		const tphBoost =
			creditsRemaining > 0
				? Math.min(creditsRemaining, HOURLY_CREDIT_BOOST_CAP)
				: 0;
		const tphLimit = limits.tph + tphBoost;
		const tpdLimit = limits.tpd + tpdBoost;
		const qpdLimit = limits.qpd;

		const tph = (hour as { tph?: number }).tph ?? 0;
		const tpd = (daily as { tpd?: number }).tpd ?? 0;
		const qpd = (daily as { qpd?: number }).qpd ?? 0;

		// Check per-hour token limit
		if (tph >= tphLimit) {
			const oldestAt = (hour as { oldestAt?: string | null }).oldestAt;
			const nextResetAt = oldestAt
				? addHours(oldestAt, 1)
				: new Date(Date.now() + 60 * 60 * 1000).toISOString();
			return {
				allowed: false,
				reason: `Token limit (${tphLimit.toLocaleString()} per hour) exceeded. Try again after the window resets.`,
				nextResetAt,
				limitType: "hour",
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
		const tphLimit = limits.tph;
		const qpmLimit = limits.qpm;
		const tpdLimit = limits.tpd;
		const qpdLimit = limits.qpd;

		if (isAdmin) {
			return {
				tph: 0,
				qpm: 0,
				tpd: 0,
				qpd: 0,
				tphLimit,
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

		const [hour, daily] = await Promise.all([
			dao.llmUsageDAO.getUsageInLastHour(username),
			dao.llmUsageDAO.getUsageInLast24Hours(username),
		]);

		const tph = (hour as { tph?: number }).tph ?? 0;
		const tpd = (daily as { tpd?: number }).tpd ?? 0;
		const qpd = (daily as { qpd?: number }).qpd ?? 0;

		// Relax daily/hourly rate when user has credits (same as checkLimit)
		const cr = creditsRemaining ?? 0;
		const tpdBoost = cr > 0 ? Math.min(cr, DAILY_CREDIT_BOOST_CAP) : 0;
		const tphBoost = cr > 0 ? Math.min(cr, HOURLY_CREDIT_BOOST_CAP) : 0;
		const tphLimitEffective = limits.tph + tphBoost;
		const tpdLimitEffective = limits.tpd + tpdBoost;

		// Compute next reset (soonest of hour or daily)
		let nextResetAt: string | null = null;
		let limitType: "hour" | "daily" | undefined;

		const hourOldest = (hour as { oldestAt?: string | null }).oldestAt;
		const dailyOldest = (daily as { oldestAt?: string | null }).oldestAt;

		const hourReset = hourOldest ? addHours(hourOldest, 1) : null;
		const dailyReset = dailyOldest ? addHours(dailyOldest, 24) : null;

		const atHourLimit = tph >= tphLimitEffective;
		const atDailyLimit = tpd >= tpdLimitEffective || qpd >= limits.qpd;

		const atLimit = atHourLimit || atDailyLimit;
		if (atHourLimit && atDailyLimit) {
			const minDate = [hourReset, dailyReset]
				.filter(Boolean)
				.map((s) => new Date(s!));
			nextResetAt =
				minDate.length > 0
					? new Date(Math.min(...minDate.map((d) => d.getTime()))).toISOString()
					: null;
			limitType =
				hourReset && (!dailyReset || new Date(hourReset) < new Date(dailyReset))
					? "hour"
					: "daily";
		} else if (atHourLimit && hourReset) {
			nextResetAt = hourReset;
			limitType = "hour";
		} else if (atDailyLimit && dailyReset) {
			nextResetAt = dailyReset;
			limitType = "daily";
		} else if (hourOldest || dailyOldest) {
			// Not at limit but show when next capacity frees (oldest event + window)
			const resets: string[] = [];
			if (hourOldest) resets.push(addHours(hourOldest, 1));
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
			tph,
			qpm: 0, // no longer tracked (minute limit removed)
			tpd,
			qpd,
			tphLimit: tphLimitEffective,
			qpmLimit: limits.qpm,
			tpdLimit: tpdLimitEffective,
			qpdLimit: limits.qpd,
			nextResetAt:
				atMonthlyLimit && limits.monthlyTokens !== undefined
					? new Date(
							new Date().getFullYear(),
							new Date().getMonth() + 1,
							1
						).toISOString()
					: nextResetAt,
			atLimit: atLimit || atMonthlyLimit,
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
