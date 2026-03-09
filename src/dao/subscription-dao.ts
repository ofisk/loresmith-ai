import { BaseDAOClass } from "./base-dao";

export type SubscriptionTier = "free" | "basic" | "pro";
export type SubscriptionStatus =
	| "active"
	| "canceled"
	| "past_due"
	| "trialing"
	| "incomplete"
	| "incomplete_expired";

export interface Subscription {
	id: string;
	username: string;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	tier: SubscriptionTier;
	status: SubscriptionStatus;
	current_period_end: string | null;
	created_at: string;
	updated_at: string;
}

export interface SubscriptionUpsert {
	username: string;
	stripe_customer_id?: string | null;
	stripe_subscription_id?: string | null;
	tier: SubscriptionTier;
	status: SubscriptionStatus;
	current_period_end?: string | null;
}

export class SubscriptionDAO extends BaseDAOClass {
	async getByUsername(username: string): Promise<Subscription | null> {
		const sql = `SELECT * FROM subscriptions WHERE username = ?`;
		const row = await this.queryFirst<Subscription>(sql, [username]);
		return row;
	}

	async getByStripeSubscriptionId(
		stripeSubscriptionId: string
	): Promise<Subscription | null> {
		const sql = `SELECT * FROM subscriptions WHERE stripe_subscription_id = ?`;
		const row = await this.queryFirst<Subscription>(sql, [
			stripeSubscriptionId,
		]);
		return row;
	}

	async upsertFromStripe(data: SubscriptionUpsert): Promise<void> {
		const id = `sub_${data.username}_${Date.now()}`;
		const now = new Date().toISOString();

		// Use INSERT OR REPLACE to avoid UNIQUE constraint race when webhook and
		// billing/status sync run concurrently (Workers are multi-tenant).
		const sql = `
      INSERT INTO subscriptions (id, username, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        stripe_customer_id = COALESCE(excluded.stripe_customer_id, stripe_customer_id),
        stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, stripe_subscription_id),
        tier = excluded.tier,
        status = excluded.status,
        current_period_end = COALESCE(excluded.current_period_end, current_period_end),
        updated_at = excluded.updated_at
    `;
		await this.execute(sql, [
			id,
			data.username,
			data.stripe_customer_id ?? null,
			data.stripe_subscription_id ?? null,
			data.tier,
			data.status,
			data.current_period_end ?? null,
			now,
			now,
		]);
	}

	async upsertByStripeSubscriptionId(
		stripeSubscriptionId: string,
		data: Partial<SubscriptionUpsert>
	): Promise<void> {
		const existing = await this.getByStripeSubscriptionId(stripeSubscriptionId);
		if (!existing) return;

		const updates: string[] = [];
		const params: unknown[] = [];

		if (data.tier !== undefined) {
			updates.push("tier = ?");
			params.push(data.tier);
		}
		if (data.status !== undefined) {
			updates.push("status = ?");
			params.push(data.status);
		}
		if (data.current_period_end !== undefined) {
			updates.push("current_period_end = ?");
			params.push(data.current_period_end);
		}

		if (updates.length === 0) return;

		updates.push("updated_at = ?");
		params.push(new Date().toISOString());
		params.push(stripeSubscriptionId);

		const sql = `UPDATE subscriptions SET ${updates.join(", ")} WHERE stripe_subscription_id = ?`;
		await this.execute(sql, params);
	}
}
