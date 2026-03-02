import type { Context } from "hono";
import type Stripe from "stripe";
import { getDAOFactory } from "@/dao/dao-factory";
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

export async function handleBillingStatus(c: ContextWithAuth) {
	const auth = getUserAuth(c);
	if (!auth?.username) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	const subService = getSubscriptionService(c.env);
	const tier = await subService.getTier(auth.username);
	const limits = subService.getTierLimits(tier);

	const dao = getDAOFactory(c.env);
	const sub = await dao.subscriptionDAO.getByUsername(auth.username);

	return c.json({
		tier,
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

	const priceKeys: Record<string, Record<string, string>> = {
		basic: {
			monthly: "STRIPE_PRICE_BASIC_MONTHLY",
			annual: "STRIPE_PRICE_BASIC_ANNUAL",
		},
		pro: {
			monthly: "STRIPE_PRICE_PRO_MONTHLY",
			annual: "STRIPE_PRICE_PRO_ANNUAL",
		},
	};
	const priceKey = priceKeys[tier][interval];
	let priceId = await getEnvVar(c.env, priceKey, false);
	if (!priceId && interval === "annual") {
		priceId = await getEnvVar(c.env, priceKeys[tier].monthly, false);
	}
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
		return c.json({ error: msg }, 400);
	}

	const dao = getDAOFactory(c.env);

	switch (event.type) {
		case "checkout.session.completed": {
			const session = event.data.object as Stripe.Checkout.Session;
			const subId = session.subscription as string;
			const metadata = session.metadata ?? {};
			const username = metadata.username as string;
			const tier = (metadata.tier as "basic" | "pro") || "basic";

			if (!username) {
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

			await dao.subscriptionDAO.upsertByStripeSubscriptionId(subId, {
				status:
					event.type === "customer.subscription.deleted" ? "canceled" : status,
				current_period_end: periodEnd,
			});
			break;
		}
		default:
			// Ignore other events
			break;
	}

	return c.json({ received: true });
}
