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
	qph: number;
	tpd: number;
	qpd: number;
	tphLimit: number;
	qphLimit: number;
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

		const dao = getDAOFactory(this.env);
		let creditsRemaining = 0;

		if (limits.lifetimeTokens !== undefined) {
			const [lifetimeUsage, credits] = await Promise.all([
				dao.userFreeTierUsageDAO.getLifetimeUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			creditsRemaining = credits;
			const effectiveLimit = limits.lifetimeTokens + credits;
			if (lifetimeUsage >= effectiveLimit) {
				return {
					allowed: false,
					reason: `Trial token limit (${effectiveLimit.toLocaleString()}) exceeded. Upgrade for more capacity.`,
					limitType: "daily",
				};
			}
		} else if (limits.monthlyTokens !== undefined) {
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
		} else {
			// Paid tiers: fetch credits so purchased one-offs boost daily/hourly limits
			creditsRemaining = await dao.userCreditsDAO.getCredits(username);
		}

		const llmDao = dao.llmUsageDAO;
		const [hour, daily] = await Promise.all([
			llmDao.getUsageInLastHour(username),
			llmDao.getUsageInLast24Hours(username),
		]);

		// Add purchased one-off credits directly to daily/hourly limits
		const tpdBoost = creditsRemaining;
		const tphBoost = creditsRemaining;
		const tphLimit = limits.tph + tphBoost;
		const qphLimit = limits.qph;
		const tpdLimit = limits.tpd + tpdBoost;
		const qpdLimit = limits.qpd;

		const tph = (hour as { tph?: number }).tph ?? 0;
		const qph = (hour as { qph?: number }).qph ?? 0;
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

		// Check per-hour query limit
		if (qph >= qphLimit) {
			const oldestAt = (hour as { oldestAt?: string | null }).oldestAt;
			const nextResetAt = oldestAt
				? addHours(oldestAt, 1)
				: new Date(Date.now() + 60 * 60 * 1000).toISOString();
			return {
				allowed: false,
				reason: `Query limit (${qphLimit} per hour) exceeded. Try again after the window resets.`,
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

		// Free tier: check lifetime trial or monthly cap with estimated tokens
		if (limits.lifetimeTokens !== undefined) {
			const dao = getDAOFactory(this.env);
			const [lifetimeUsage, creditsRemaining] = await Promise.all([
				dao.userFreeTierUsageDAO.getLifetimeUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			const effectiveLimit = limits.lifetimeTokens + creditsRemaining;
			const wouldExceed = lifetimeUsage + estimatedTokens > effectiveLimit;
			const alreadyExceeded = lifetimeUsage >= effectiveLimit;

			if (alreadyExceeded) {
				return {
					allowed: false,
					reason: `Trial token limit (${effectiveLimit.toLocaleString()}) exceeded. Upgrade for more capacity.`,
					wouldExceed: true,
					monthlyUsage: lifetimeUsage,
					monthlyLimit: effectiveLimit,
					creditsRemaining,
				};
			}
			if (wouldExceed) {
				return {
					allowed: false,
					reason: `This action would exceed your trial token limit. You have ${(effectiveLimit - lifetimeUsage).toLocaleString()} tokens remaining.`,
					wouldExceed: true,
					monthlyUsage: lifetimeUsage,
					monthlyLimit: effectiveLimit,
					creditsRemaining,
				};
			}
			return {
				allowed: true,
				monthlyUsage: lifetimeUsage,
				monthlyLimit: effectiveLimit,
				creditsRemaining,
			};
		}
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

		// Free tier: track usage for cap (lifetime trial or monthly)
		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username);
		const limits = subService.getTierLimits(tier);
		if (limits.lifetimeTokens !== undefined) {
			await dao.userFreeTierUsageDAO.incrementUsage(username, tokens);
		} else if (limits.monthlyTokens !== undefined) {
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
		const qphLimit = limits.qph;
		const tpdLimit = limits.tpd;
		const qpdLimit = limits.qpd;

		if (isAdmin) {
			return {
				tph: 0,
				qph: 0,
				tpd: 0,
				qpd: 0,
				tphLimit,
				qphLimit,
				tpdLimit,
				qpdLimit,
				nextResetAt: null,
				atLimit: false,
				isAdmin: true,
			};
		}

		const dao = getDAOFactory(this.env);

		// Free tier: include usage and credits for UI (lifetime trial or monthly)
		// Paid tiers: fetch credits so effective limits reflect purchased one-offs
		let monthlyUsage: number | undefined;
		let monthlyLimit: number | undefined;
		let creditsRemaining: number | undefined;
		if (limits.lifetimeTokens !== undefined) {
			[monthlyUsage, creditsRemaining] = await Promise.all([
				dao.userFreeTierUsageDAO.getLifetimeUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			monthlyLimit = limits.lifetimeTokens + (creditsRemaining ?? 0);
		} else if (limits.monthlyTokens !== undefined) {
			[monthlyUsage, creditsRemaining] = await Promise.all([
				dao.userMonthlyUsageDAO.getCurrentMonthUsage(username),
				dao.userCreditsDAO.getCredits(username),
			]);
			monthlyLimit = limits.monthlyTokens + (creditsRemaining ?? 0);
		} else {
			creditsRemaining = await dao.userCreditsDAO.getCredits(username);
		}

		const [hour, daily] = await Promise.all([
			dao.llmUsageDAO.getUsageInLastHour(username),
			dao.llmUsageDAO.getUsageInLast24Hours(username),
		]);

		const tph = (hour as { tph?: number }).tph ?? 0;
		const qph = (hour as { qph?: number }).qph ?? 0;
		const tpd = (daily as { tpd?: number }).tpd ?? 0;
		const qpd = (daily as { qpd?: number }).qpd ?? 0;

		// Add purchased one-off credits directly to daily/hourly limits
		const cr = creditsRemaining ?? 0;
		const tpdBoost = cr;
		const tphBoost = cr;
		const tphLimitEffective = limits.tph + tphBoost;
		const tpdLimitEffective = limits.tpd + tpdBoost;

		// Compute next reset (soonest of hour or daily)
		let nextResetAt: string | null = null;
		let limitType: "hour" | "daily" | undefined;

		const hourOldest = (hour as { oldestAt?: string | null }).oldestAt;
		const dailyOldest = (daily as { oldestAt?: string | null }).oldestAt;

		const hourReset = hourOldest ? addHours(hourOldest, 1) : null;
		const dailyReset = dailyOldest ? addHours(dailyOldest, 24) : null;

		const atHourLimit = tph >= tphLimitEffective || qph >= limits.qph;
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

		// Free tier: also at limit if trial/monthly cap exceeded
		const atTierCapLimit =
			monthlyLimit !== undefined &&
			monthlyUsage !== undefined &&
			monthlyUsage >= monthlyLimit;

		// Lifetime trial has no reset; monthly has next month
		const tierCapNextReset =
			atTierCapLimit && limits.monthlyTokens !== undefined
				? new Date(
						new Date().getFullYear(),
						new Date().getMonth() + 1,
						1
					).toISOString()
				: null;

		return {
			tph,
			qph,
			tpd,
			qpd,
			tphLimit: tphLimitEffective,
			qphLimit: limits.qph,
			tpdLimit: tpdLimitEffective,
			qpdLimit: limits.qpd,
			nextResetAt: atTierCapLimit ? tierCapNextReset : nextResetAt,
			atLimit: atLimit || atTierCapLimit,
			limitType: atTierCapLimit ? "daily" : limitType,
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
