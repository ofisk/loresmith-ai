import {
	SUBSCRIPTION_TIERS,
	type SubscriptionTier,
	type TierLimits,
} from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import type { Env } from "@/middleware/auth";

export class SubscriptionService {
	constructor(private env: Env) {}

	/**
	 * Get subscription tier for a user. Admins bypass billing and receive pro limits.
	 */
	async getTier(
		username: string,
		isAdmin?: boolean
	): Promise<SubscriptionTier> {
		if (isAdmin) {
			return "pro";
		}
		const dao = getDAOFactory(this.env).subscriptionDAO;
		const sub = await dao.getByUsername(username);
		if (!sub || sub.status !== "active") {
			return "free";
		}
		return sub.tier as SubscriptionTier;
	}

	getTierLimits(tier: SubscriptionTier): TierLimits {
		return SUBSCRIPTION_TIERS[tier];
	}
}

export function getSubscriptionService(env: Env): SubscriptionService {
	return new SubscriptionService(env);
}
