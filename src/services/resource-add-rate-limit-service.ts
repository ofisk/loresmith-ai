import type { D1Database } from "@cloudflare/workers-types";
import { getDAOFactory } from "@/dao/dao-factory";
import { getSubscriptionService } from "@/services/billing/subscription-service";

export interface ResourceAddLimitResult {
	allowed: boolean;
	reason?: string;
	limit: number;
	current: number;
}

export class ResourceAddRateLimitService {
	static async checkAddLimit(
		username: string,
		campaignId: string,
		isAdmin: boolean,
		env: { DB: D1Database }
	): Promise<ResourceAddLimitResult> {
		const dao = getDAOFactory(env).resourceAddLogDAO;
		const current = await dao.getCountInLastHour(username, campaignId);

		if (isAdmin) {
			return { allowed: true, limit: 999_999, current };
		}

		const subService = getSubscriptionService(env as any);
		const tier = await subService.getTier(username, isAdmin);
		const limits = subService.getTierLimits(tier);
		const limit = limits.resourcesPerCampaignPerHour;

		if (current >= limit) {
			return {
				allowed: false,
				reason: `Resource add limit (${limit} per campaign per hour for ${tier}) reached. Try again later.`,
				limit,
				current,
			};
		}

		return { allowed: true, limit, current };
	}

	static async recordAdd(
		username: string,
		campaignId: string,
		env: { DB: D1Database }
	): Promise<void> {
		const dao = getDAOFactory(env).resourceAddLogDAO;
		await dao.recordAdd(username, campaignId);
	}
}
