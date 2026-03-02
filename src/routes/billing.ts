import type { Context } from "hono";
import type Stripe from "stripe";
import { getDAOFactory } from "@/dao/dao-factory";
import type { SubscriptionStatus } from "@/dao/subscription-dao";
import { getEnvVar } from "@/lib/env-utils";
import type { Env } from "@/routes/register-routes";
import { getSubscriptionService } from "@/services/billing/subscription-service";
import { DEFAULT_APP_ORIGIN } from "@/shared-config";

async function getStripe(env: Env): Promise<Stripe> {
	const key = await getEnvVar(env, "STRIPE_SECRET_KEY", false);
	if (!key) {
		throw new Error("STRIPE_SECRET_KEY not configured");
	}
	const { default: Stripe } = await import("stripe");
	return new Stripe(key);
}

function getOrigin(env: Env): string {
	const origin =
		(typeof env.APP_ORIGIN === "string" && env.APP_ORIGIN) ||
		(typeof env.PRODUCTION_URL === "string" && env.PRODUCTION_URL);
	return origin || DEFAULT_APP_ORIGIN;
}

type ContextWithAuth = Context<{ Bindings: Env }>;

function getUserAuth(
	c: ContextWithAuth
): { username: string; isAdmin?: boolean } | null {
	return (
		(c as { userAuth?: { username: string; isAdmin?: boolean } }).userAuth ??
		null
	);
}

const PRICE_KEYS = {
	basic: {
		monthly: "STRIPE_PRICE_BASIC_MONTHLY",
		annual: "STRIPE_PRICE_BASIC_ANNUAL",
	},
	pro: {
		monthly: "STRIPE_PRICE_PRO_MONTHLY",
		annual: "STRIPE_PRICE_PRO_ANNUAL",
	},
} as const;

async function getPriceIdForTier(
	env: Env,
	tier: "basic" | "pro",
	interval: "monthly" | "annual"
): Promise<string | null> {
	let priceId = await getEnvVar(env, PRICE_KEYS[tier][interval], false);
	if (!priceId && interval === "annual") {
		priceId = await getEnvVar(env, PRICE_KEYS[tier].monthly, false);
	}
	return priceId ?? null;
}

async function getTierFromPriceId(
	env: Env,
	priceId: string
): Promise<"basic" | "pro"> {
	const proPrices = [
		await getEnvVar(env, PRICE_KEYS.pro.monthly, false),
		await getEnvVar(env, PRICE_KEYS.pro.annual, false),
	].filter(Boolean);
	return proPrices.includes(priceId) ? "pro" : "basic";
}

/** Sync subscription from Stripe when local DB is missing or stale (e.g. webhook was missed). */
async function syncSubscriptionFromStripe(
	env: Env,
	username: string,
	email: string | null | undefined,
	existingCustomerId: string | null
): Promise<boolean> {
	const stripe = await getStripe(env).catch(() => null);
	if (!stripe) return false;

	let customerId = existingCustomerId;
	if (!customerId && email) {
		const customers = await stripe.customers.list({ email, limit: 1 });
		if (customers.data.length === 0) return false;
		customerId = customers.data[0].id;
	}
	if (!customerId) return false;

	const subs = await stripe.subscriptions.list({
		customer: customerId,
		status: "all",
		limit: 10,
	});
	const activeSub = subs.data.find(
		(s) => s.status === "active" || s.status === "trialing"
	);
	if (!activeSub) return false;

	const sub = activeSub;
	const priceId =
		typeof sub.items.data[0]?.price === "string"
			? sub.items.data[0].price
			: sub.items.data[0]?.price?.id;
	if (!priceId) return false;

	const tier = await getTierFromPriceId(env, priceId);

	const periodEnd = sub.current_period_end
		? new Date(sub.current_period_end * 1000).toISOString()
		: undefined;

	const dao = getDAOFactory(env);
	await dao.subscriptionDAO.upsertFromStripe({
		username,
		stripe_customer_id: customerId,
		stripe_subscription_id: sub.id,
		tier: tier as "basic" | "pro",
		status: "active",
		current_period_end: periodEnd,
	});
	return true;
}

export async function handleBillingStatus(c: ContextWithAuth) {
	const auth = getUserAuth(c);
	if (!auth?.username) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const subService = getSubscriptionService(c.env);
	let tier = await subService.getTier(auth.username, auth.isAdmin);

	// If local DB says free but user might have a Stripe subscription (e.g. webhook was missed), sync from Stripe
	if (tier === "free") {
		const dao = getDAOFactory(c.env);
		const user = await dao.authUserDAO.getUserByUsername(auth.username);
		const existingSub = await dao.subscriptionDAO.getByUsername(auth.username);
		const synced = await syncSubscriptionFromStripe(
			c.env,
			auth.username,
			user?.email,
			existingSub?.stripe_customer_id ?? null
		);
		if (synced) {
			tier = await subService.getTier(auth.username, auth.isAdmin);
		}
	}

	const limits = subService.getTierLimits(tier);

	const dao = getDAOFactory(c.env);
	const sub = await dao.subscriptionDAO.getByUsername(auth.username);

	return c.json({
		tier,
		isAdmin: auth.isAdmin ?? false,
		status: sub?.status ?? "active",
		currentPeriodEnd: sub?.current_period_end ?? null,
		limits: {
			maxCampaigns: limits.maxCampaigns,
			maxFiles: limits.maxFiles,
			storageBytes: limits.storageBytes,
			tpm: limits.tpm,
			qpm: limits.qpm,
			tpd: limits.tpd,
			qpd: limits.qpd,
			monthlyTokens: limits.monthlyTokens,
		},
	});
}

export async function handleBillingCheckout(c: ContextWithAuth) {
	const auth = getUserAuth(c);
	if (!auth?.username) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.json().catch(() => ({}));
	const tier = (body?.tier as string) || "basic";
	const interval = (body?.interval as string) || "monthly";
	if (tier !== "basic" && tier !== "pro") {
		return c.json({ error: "Invalid tier. Use basic or pro." }, 400);
	}
	if (interval !== "monthly" && interval !== "annual") {
		return c.json({ error: "Invalid interval. Use monthly or annual." }, 400);
	}

	const priceId = await getPriceIdForTier(c.env, tier, interval);
	if (!priceId) {
		return c.json(
			{ error: "Billing not configured. Missing Stripe price ID." },
			503
		);
	}

	const stripe = await getStripe(c.env);
	const dao = getDAOFactory(c.env);
	const user = await dao.authUserDAO.getUserByUsername(auth.username);
	const email = user?.email ?? undefined;

	let customerId: string | undefined;
	const existingSub = await dao.subscriptionDAO.getByUsername(auth.username);
	if (existingSub?.stripe_customer_id) {
		customerId = existingSub.stripe_customer_id;
	} else if (email) {
		const customers = await stripe.customers.list({
			email,
			limit: 1,
		});
		if (customers.data.length > 0) {
			customerId = customers.data[0].id;
		}
	}

	if (!customerId && email) {
		const customer = await stripe.customers.create({
			email,
			metadata: { username: auth.username },
		});
		customerId = customer.id;
	}

	if (!customerId && !email) {
		return c.json(
			{ error: "Unable to create checkout: no email on account." },
			400
		);
	}

	const origin = getOrigin(c.env);
	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		...(customerId
			? { customer: customerId }
			: { customer_email: email ?? undefined }),
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: `${origin}/billing?checkout=success`,
		cancel_url: `${origin}/billing?checkout=canceled`,
		metadata: { username: auth.username, tier },
		subscription_data: {
			metadata: { username: auth.username, tier },
		},
	});

	return c.json({ url: session.url });
}

export async function handleBillingChangePlan(c: ContextWithAuth) {
	const auth = getUserAuth(c);
	if (!auth?.username) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const body = await c.req.json().catch(() => ({}));
	const tier = body?.tier as string;
	if (tier !== "basic" && tier !== "pro") {
		return c.json({ error: "Invalid tier. Use basic or pro." }, 400);
	}

	const dao = getDAOFactory(c.env);
	const sub = await dao.subscriptionDAO.getByUsername(auth.username);
	if (!sub?.stripe_subscription_id) {
		return c.json(
			{ error: "No active subscription. Subscribe first to change plans." },
			400
		);
	}

	if (sub.status !== "active") {
		return c.json(
			{ error: "Subscription is not active. Manage billing in the portal." },
			400
		);
	}

	const currentTier = sub.tier as "basic" | "pro";
	if (currentTier === tier) {
		return c.json({ error: "Already on this plan." }, 400);
	}

	const stripe = await getStripe(c.env);
	const stripeSub = await stripe.subscriptions.retrieve(
		sub.stripe_subscription_id
	);
	const subscriptionItem = stripeSub.items.data[0];
	if (!subscriptionItem) {
		return c.json({ error: "Invalid subscription." }, 500);
	}

	const currentPriceId =
		typeof subscriptionItem.price === "string"
			? subscriptionItem.price
			: subscriptionItem.price?.id;
	if (!currentPriceId) {
		return c.json({ error: "Could not determine current plan." }, 500);
	}

	const isAnnual =
		currentPriceId ===
			(await getEnvVar(c.env, PRICE_KEYS.basic.annual, false)) ||
		currentPriceId === (await getEnvVar(c.env, PRICE_KEYS.pro.annual, false));
	const interval = isAnnual ? "annual" : "monthly";

	const newPriceId = await getPriceIdForTier(c.env, tier, interval);
	if (!newPriceId) {
		return c.json(
			{ error: "Billing not configured. Missing Stripe price ID." },
			503
		);
	}

	// Use pending_if_incomplete so the subscription only updates when payment succeeds.
	// We do NOT update our DB here - we rely on customer.subscription.updated webhook
	// which fires when the pending update is applied (after successful payment).
	await stripe.subscriptions.update(sub.stripe_subscription_id, {
		items: [{ id: subscriptionItem.id, price: newPriceId }],
		metadata: { username: auth.username, tier },
		proration_behavior: "always_invoice",
		payment_behavior: "pending_if_incomplete",
	});

	return c.json({
		success: true,
		tier,
		pendingPayment: true,
		message:
			"You will receive access to the new plan once your payment is confirmed.",
	});
}

export async function handleBillingPortal(c: ContextWithAuth) {
	const auth = getUserAuth(c);
	if (!auth?.username) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const dao = getDAOFactory(c.env);
	const sub = await dao.subscriptionDAO.getByUsername(auth.username);
	if (!sub?.stripe_customer_id) {
		return c.json(
			{ error: "No subscription found. Subscribe first to manage billing." },
			400
		);
	}

	const stripe = await getStripe(c.env);
	const origin = getOrigin(c.env);
	const session = await stripe.billingPortal.sessions.create({
		customer: sub.stripe_customer_id,
		return_url: `${origin}/billing`,
	});

	return c.json({ url: session.url });
}

export async function handleBillingWebhook(c: Context<{ Bindings: Env }>) {
	const sig = c.req.header("Stripe-Signature");
	if (!sig) {
		console.warn("[BillingWebhook] Missing Stripe-Signature header");
		return c.json({ error: "Missing Stripe-Signature" }, 400);
	}

	const webhookSecret = await getEnvVar(c.env, "STRIPE_WEBHOOK_SECRET", false);
	if (!webhookSecret) {
		return c.json({ error: "Webhook not configured" }, 503);
	}

	const rawBody = await c.req.text();
	let event: Stripe.Event;
	try {
		const { default: Stripe } = await import("stripe");
		event = Stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Invalid signature";
		console.warn(
			"[BillingWebhook] Signature verification failed - ensure STRIPE_WEBHOOK_SECRET matches the signing secret from Stripe Dashboard for this endpoint:",
			msg
		);
		return c.json({ error: msg }, 400);
	}

	const dao = getDAOFactory(c.env);

	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;
			const subId = session.subscription as string;
			const metadata = session.metadata ?? {};
			let username = metadata.username as string | undefined;
			const tier = (metadata.tier as "basic" | "pro") || "basic";

			// Fallback: look up user by customer email if metadata.username missing
			if (!username) {
				const email =
					(session.customer_details?.email as string) ??
					(session.customer_email as string);
				if (email) {
					const user = await dao.authUserDAO.getUserByEmail(email);
					if (user) username = user.username;
				}
			}

			if (!username) {
				console.warn(
					"[BillingWebhook] checkout.session.completed missing username in metadata and could not resolve from customer email. metadata:",
					JSON.stringify(metadata)
				);
				return c.json({ error: "Missing username in session metadata" }, 400);
			}

			let periodEnd: string | undefined;
			if (subId) {
				const stripe = await getStripe(c.env);
				const sub = await stripe.subscriptions.retrieve(subId);
				periodEnd = sub.current_period_end
					? new Date(sub.current_period_end * 1000).toISOString()
					: undefined;
			}

			await dao.subscriptionDAO.upsertFromStripe({
				username,
				stripe_customer_id: session.customer as string,
				stripe_subscription_id: subId,
				tier,
				status: "active",
				current_period_end: periodEnd,
			});
			break;
		}
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			const sub = event.data.object as Stripe.Subscription;
			const subId = sub.id;
			const status = sub.status as
				| "active"
				| "canceled"
				| "past_due"
				| "trialing";
			const periodEnd = sub.current_period_end
				? new Date(sub.current_period_end * 1000).toISOString()
				: undefined;

			const resolvedStatus: SubscriptionStatus =
				event.type === "customer.subscription.deleted" ? "canceled" : status;
			const updatePayload: Parameters<
				typeof dao.subscriptionDAO.upsertByStripeSubscriptionId
			>[1] = {
				status: resolvedStatus,
				current_period_end: periodEnd,
			};

			// Sync tier from price when subscription is updated (plan change, etc.)
			if (
				event.type === "customer.subscription.updated" &&
				(status === "active" || status === "trialing") &&
				sub.items?.data?.[0]
			) {
				const priceId =
					typeof sub.items.data[0].price === "string"
						? sub.items.data[0].price
						: sub.items.data[0].price?.id;
				if (priceId) {
					updatePayload.tier = await getTierFromPriceId(c.env, priceId);
				}
			}

			await dao.subscriptionDAO.upsertByStripeSubscriptionId(
				subId,
				updatePayload
			);
			break;
		}
		default:
			// Ignore other events
			break;
	}

	return c.json({ received: true });
}
