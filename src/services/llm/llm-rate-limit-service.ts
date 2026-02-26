import { RATE_LIMITS } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";

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

		const dao = getDAOFactory(this.env).llmUsageDAO;
		const [minute, daily] = await Promise.all([
			dao.getUsageInLastMinute(username),
			dao.getUsageInLast24Hours(username),
		]);

		const tpmLimit = RATE_LIMITS.NON_ADMIN_TPM;
		const qpmLimit = RATE_LIMITS.NON_ADMIN_QPM;
		const tpdLimit = RATE_LIMITS.NON_ADMIN_TPD;
		const qpdLimit = RATE_LIMITS.NON_ADMIN_QPD;

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

	async recordUsage(
		username: string,
		tokens: number,
		queryCount: number,
		model?: string
	): Promise<void> {
		const dao = getDAOFactory(this.env).llmUsageDAO;
		await dao.insertUsage(username, tokens, queryCount, model);
	}

	async getUsageStatus(
		username: string,
		isAdmin: boolean
	): Promise<UsageStatus> {
		const tpmLimit = RATE_LIMITS.NON_ADMIN_TPM;
		const qpmLimit = RATE_LIMITS.NON_ADMIN_QPM;
		const tpdLimit = RATE_LIMITS.NON_ADMIN_TPD;
		const qpdLimit = RATE_LIMITS.NON_ADMIN_QPD;

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

		const dao = getDAOFactory(this.env).llmUsageDAO;
		const [minute, daily] = await Promise.all([
			dao.getUsageInLastMinute(username),
			dao.getUsageInLast24Hours(username),
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

		return {
			tpm,
			qpm,
			tpd,
			qpd,
			tpmLimit,
			qpmLimit,
			tpdLimit,
			qpdLimit,
			nextResetAt,
			atLimit: atMinuteLimit || atDailyLimit,
			limitType,
			isAdmin: false,
		};
	}
}

export function getLLMRateLimitService(env: Env): LLMRateLimitService {
	return new LLMRateLimitService(env);
}
