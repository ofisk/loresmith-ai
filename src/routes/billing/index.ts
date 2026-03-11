import type { Hono } from "hono";
import type { RequestLogger } from "@/lib/logger";
import { requireUserJwt } from "@/routes/auth";
import {
	handleBillingChangePlan,
	handleBillingCheckout,
	handleBillingCheckoutCredits,
	handleBillingPortal,
	handleBillingQuotaStatus,
	handleBillingStatus,
	handleBillingWebhook,
	handleRetryLimitStatus,
} from "@/routes/billing";
import type { Env } from "@/routes/env";
import { toApiRoutePath } from "@/routes/env";
import { API_CONFIG } from "@/shared-config";

export function registerBillingRoutes(
	app: Hono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	// Webhook has no auth - verified via Stripe signature
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.WEBHOOK),
		handleBillingWebhook
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.STATUS),
		requireUserJwt,
		handleBillingStatus
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.QUOTA_STATUS),
		requireUserJwt,
		handleBillingQuotaStatus
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.CHECKOUT_CREDITS),
		requireUserJwt,
		handleBillingCheckoutCredits
	);
	app.get(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.RETRY_LIMIT_STATUS),
		requireUserJwt,
		handleRetryLimitStatus
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.CHECKOUT),
		requireUserJwt,
		handleBillingCheckout
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.CHANGE_PLAN),
		requireUserJwt,
		handleBillingChangePlan
	);
	app.post(
		toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.PORTAL),
		requireUserJwt,
		handleBillingPortal
	);
}
