import type { TextGenerationTier, TierLimits } from "@/app-constants";
import { deriveBatchRequestBudget } from "@/config/anthropic-org-rate-budget";
import { estimateCostUsd } from "@/config/model-pricing";
import { getDAOFactory } from "@/dao/dao-factory";
import type { CostEventInsert } from "@/dao/llm-cost-event-dao";
import type { FreeTierAllowance } from "@/lib/free-tier-allowance";
import {
	computeFreeTierAllowance,
	nextMonthlyResetAt,
	splitSpendAcrossBuckets,
} from "@/lib/free-tier-allowance";
import type { LlmTokenBreakdown } from "@/lib/llm-usage-breakdown";
import { hasPriceableSplit } from "@/lib/llm-usage-breakdown";
import type { LlmSpendIntent } from "@/lib/llm-usage-intents";
import { surfaceForIntent } from "@/lib/llm-usage-intents";
import { logVerboseLlmSpend } from "@/lib/llm-usage-verbose-log";
import { createLogger } from "@/lib/logger";
import type { Env } from "@/middleware/auth";
import { getSubscriptionService } from "@/services/billing/subscription-service";
import { LLM_BATCH_BUDGET_WINDOW_SECONDS } from "@/services/llm/llm-batch-config";

/**
 * Attribution for a unit of LLM spend. `intent` is required; everything else is
 * best-effort. Fields listed here are persisted as columns on `llm_cost_events`;
 * anything else lands in the verbose log's `extras` bag.
 */
export type LlmSpendLogMeta = {
	intent: LlmSpendIntent;
	source?: string;
	/** Agent class name, when the spend happened inside an agent. */
	agent?: string;
	/** Model id, when the caller could not pass it as the `model` argument. */
	model?: string;
	/** Tier the model was selected from — lets us verify cheap-tier routing. */
	modelRole?: TextGenerationTier;
	provider?: string;
} & LlmTokenBreakdown &
	Record<string, unknown>;

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

/** D1 stores absent attribution as NULL, not undefined. */
function orNull<T>(value: T | undefined | null): T | null {
	return value ?? null;
}

function orZero(value: number | undefined): number {
	return value ?? 0;
}

/** Shape one attributed, priced `llm_cost_events` row from spend metadata. */
function buildCostEvent(
	username: string,
	tier: string,
	tokens: number,
	queryCount: number,
	model: string | undefined,
	meta: LlmSpendLogMeta
): CostEventInsert {
	const resolvedModel = orNull(model ?? meta.model);
	const breakdown: LlmTokenBreakdown = {
		promptTokens: meta.promptTokens,
		completionTokens: meta.completionTokens,
		cachedInputTokens: meta.cachedInputTokens,
		cacheWriteTokens: meta.cacheWriteTokens,
	};
	// Without an input/output split we cannot price the call: output tokens cost
	// ~5x input, so guessing a ratio would invent dollars. Record the event
	// unpriced instead — the dashboard surfaces that gap explicitly.
	const estimate = hasPriceableSplit(breakdown)
		? estimateCostUsd(resolvedModel, breakdown)
		: { costUsd: 0, priced: false, unverified: false };

	return {
		username,
		tier,
		intent: meta.intent,
		source: orNull(meta.source),
		agent: orNull(meta.agent),
		model: resolvedModel,
		provider: orNull(meta.provider),
		modelRole: orNull(meta.modelRole),
		surface: surfaceForIntent(meta.intent),
		promptTokens: orZero(breakdown.promptTokens),
		completionTokens: orZero(breakdown.completionTokens),
		cachedInputTokens: orZero(breakdown.cachedInputTokens),
		cacheWriteTokens: orZero(breakdown.cacheWriteTokens),
		totalTokens: tokens,
		queryCount,
		costUsd: estimate.costUsd,
		priced: estimate.priced,
	};
}

/**
 * Message shown when both free-tier buckets are drained.
 *
 * It has to say the allowance comes back. The old copy ("Upgrade for more
 * capacity") described a dead end, which was accurate then and is not now —
 * and a user who believes their account is finished has no reason to return.
 */
function freeTierExhaustedReason(limits: TierLimits): string {
	const monthly = limits.monthlyTokens ?? 0;
	if (monthly <= 0) {
		return "Token allowance used up. Upgrade or purchase credits for more capacity.";
	}
	const resetsOn = new Date(nextMonthlyResetAt()).toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
	});
	return `Free token allowance used up. Your ${monthly.toLocaleString()} monthly tokens refresh on ${resetsOn} — your campaigns stay readable in the meantime. Upgrade or purchase credits to keep generating now.`;
}

export class LLMRateLimitService {
	constructor(private env: Env) {}

	/** True when the tier is governed by token buckets rather than tph/tpd alone. */
	private hasTokenAllowance(limits: TierLimits): boolean {
		return (
			limits.monthlyTokens !== undefined || limits.trialTokens !== undefined
		);
	}

	/**
	 * Read both free-tier buckets plus credits in one round of parallel queries.
	 *
	 * Callers must have checked {@link hasTokenAllowance} first; a tier with
	 * neither bucket would compute a zero limit and read as exhausted.
	 */
	private async loadFreeTierAllowance(
		username: string,
		limits: TierLimits
	): Promise<FreeTierAllowance> {
		const dao = getDAOFactory(this.env);
		const monthlyTokens = limits.monthlyTokens ?? 0;
		const trialTokens = limits.trialTokens ?? 0;

		const [monthUsed, trialUsed, credits] = await Promise.all([
			monthlyTokens > 0
				? dao.userMonthlyUsageDAO.getCurrentMonthUsage(username)
				: Promise.resolve(0),
			trialTokens > 0
				? dao.userFreeTierUsageDAO.getTrialUsage(username)
				: Promise.resolve(0),
			dao.userCreditsDAO.getCredits(username),
		]);

		return computeFreeTierAllowance({
			monthlyTokens,
			trialTokens,
			monthUsed,
			trialUsed,
			credits,
		});
	}

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

		if (this.hasTokenAllowance(limits)) {
			const allowance = await this.loadFreeTierAllowance(username, limits);
			creditsRemaining = allowance.credits;
			if (allowance.exhausted) {
				return {
					allowed: false,
					reason: freeTierExhaustedReason(limits),
					nextResetAt: nextMonthlyResetAt(),
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

		// Free tier: check the combined allowance against an estimate of the work
		if (this.hasTokenAllowance(limits)) {
			const allowance = await this.loadFreeTierAllowance(username, limits);
			const blocked = {
				allowed: false,
				wouldExceed: true,
				monthlyUsage: allowance.used,
				monthlyLimit: allowance.limit,
				creditsRemaining: allowance.credits,
				nextResetAt: nextMonthlyResetAt(),
			};

			if (allowance.exhausted) {
				return { ...blocked, reason: freeTierExhaustedReason(limits) };
			}
			if (allowance.remaining < estimatedTokens) {
				return {
					...blocked,
					reason: `This needs about ${estimatedTokens.toLocaleString()} tokens and you have ${allowance.remaining.toLocaleString()} left. Purchase credits, upgrade, or wait for your monthly allowance to refresh.`,
				};
			}
			return {
				allowed: true,
				monthlyUsage: allowance.used,
				monthlyLimit: allowance.limit,
				creditsRemaining: allowance.credits,
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

	/**
	 * Check the **batch** request budget before submitting a message batch.
	 *
	 * Batch requests draw on `ANTHROPIC_ORG_LIMITS.batchRequestsPerMinute`, which
	 * is separate from the interactive RPM the per-tier `qph`/`qpd` limits are
	 * derived from — so background indexing is not charged against the budget a
	 * user's chat spends, and vice versa. Token caps are still enforced: batch
	 * token usage is recorded by {@link recordBatchUsage} and so counts toward
	 * `tph`/`tpd` and the free-tier monthly/lifetime caps.
	 */
	async checkBatchRequestBudget(
		username: string,
		requestCount: number,
		isAdmin: boolean = false
	): Promise<CheckLimitResult> {
		if (isAdmin) {
			return { allowed: true };
		}

		const dao = getDAOFactory(this.env).llmBatchJobDAO;
		if (!(await dao.isSchemaReady())) {
			// No batch table means the batch path is inert; nothing to gate.
			return { allowed: true };
		}

		const { requestsPerMinutePerUser } = deriveBatchRequestBudget();
		const recent = await dao.getRequestCountSince(
			username,
			LLM_BATCH_BUDGET_WINDOW_SECONDS
		);

		if (recent + requestCount > requestsPerMinutePerUser) {
			return {
				allowed: false,
				reason: `Batch request budget (${requestsPerMinutePerUser} per minute) would be exceeded: ${recent} already submitted, ${requestCount} requested.`,
				limitType: "hour",
			};
		}
		return { allowed: true };
	}

	/**
	 * Record token spend for a completed batch.
	 *
	 * Tokens are recorded verbatim (the row is also the analytics source of
	 * truth), but `queryCount` is 0: the batch's request volume was already
	 * gated by {@link checkBatchRequestBudget} against the separate batch budget
	 * line, and counting it again here would double-charge it to the interactive
	 * query budget.
	 */
	async recordBatchUsage(
		username: string,
		tokens: number,
		model: string | undefined,
		meta: LlmSpendLogMeta & { batchRequestCount: number }
	): Promise<void> {
		const { batchRequestCount, ...logMeta } = meta;
		await this.recordUsage(username, tokens, 0, model, {
			...logMeta,
			batchRequestCount,
			billingMode: "batch",
		});
	}

	async recordUsage(
		username: string,
		tokens: number,
		queryCount: number,
		model?: string,
		meta?: LlmSpendLogMeta
	): Promise<void> {
		const dao = getDAOFactory(this.env);
		await dao.llmUsageDAO.insertUsage(username, tokens, queryCount, model);

		if (meta) {
			const {
				intent,
				source,
				agent,
				model: metaModel,
				modelRole,
				provider,
				promptTokens,
				completionTokens,
				cachedInputTokens,
				cacheWriteTokens,
				...extras
			} = meta;
			logVerboseLlmSpend(this.env, {
				intent,
				source,
				username,
				tokens,
				queryCount,
				model: model ?? metaModel,
				promptTokens,
				completionTokens,
				extras:
					Object.keys(extras).length > 0
						? (extras as Record<string, unknown>)
						: undefined,
			});
		}

		// Free tier: track usage for cap (lifetime trial or monthly)
		const subService = getSubscriptionService(this.env);
		const tier = await subService.getTier(username);
		const limits = subService.getTierLimits(tier);

		// Attribution is derived from the same tier lookup, so it costs no extra read.
		if (meta) {
			await this.recordCostEvent(
				username,
				tier,
				tokens,
				queryCount,
				model,
				meta
			);
		}

		// Free tier: draw from the recurring monthly allowance first and let the
		// overflow fall to the one-time welcome grant, so the grant is spent only
		// on months the monthly bucket could not cover.
		if (this.hasTokenAllowance(limits)) {
			const monthlyTokens = limits.monthlyTokens ?? 0;
			const monthUsed =
				monthlyTokens > 0
					? await dao.userMonthlyUsageDAO.getCurrentMonthUsage(username)
					: 0;
			const { toMonthly, toTrial } = splitSpendAcrossBuckets(
				tokens,
				monthlyTokens,
				monthUsed
			);
			await Promise.all([
				toMonthly > 0
					? dao.userMonthlyUsageDAO.incrementUsage(username, toMonthly)
					: Promise.resolve(),
				toTrial > 0 && limits.trialTokens !== undefined
					? dao.userFreeTierUsageDAO.incrementUsage(username, toTrial)
					: Promise.resolve(),
			]);
		}
	}

	/**
	 * Persist one attributed, priced spend event for the admin dashboard.
	 *
	 * Best-effort by design: accounting must never break a user's turn, and this
	 * runs after the rate-limit ledger has already been written.
	 */
	private async recordCostEvent(
		username: string,
		tier: string,
		tokens: number,
		queryCount: number,
		model: string | undefined,
		meta: LlmSpendLogMeta
	): Promise<void> {
		try {
			await getDAOFactory(this.env).llmCostEventDAO.insertEvent(
				buildCostEvent(username, tier, tokens, queryCount, model, meta)
			);
		} catch (error) {
			createLogger(
				this.env as unknown as Record<string, unknown>,
				"[LLMRateLimit]"
			).warn("Failed to record cost attribution event", error);
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

		// Free tier: report the combined allowance for the UI.
		// Paid tiers: fetch credits so effective limits reflect purchased one-offs
		let monthlyUsage: number | undefined;
		let monthlyLimit: number | undefined;
		let creditsRemaining: number | undefined;
		if (this.hasTokenAllowance(limits)) {
			const allowance = await this.loadFreeTierAllowance(username, limits);
			monthlyUsage = allowance.used;
			monthlyLimit = allowance.limit;
			creditsRemaining = allowance.credits;
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
