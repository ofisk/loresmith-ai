import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Handler } from "hono";
import type { RequestLogger } from "@/lib/logger";
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
import {
	routeBillingChangePlan,
	routeBillingCheckout,
	routeBillingCheckoutCredits,
	routeBillingPortal,
	routeBillingQuotaStatus,
	routeBillingRetryLimitStatus,
	routeBillingStatus,
	routeBillingWebhook,
} from "@/routes/billing/routes";
import type { Env } from "@/routes/env";

export function registerBillingRoutes(
	app: OpenAPIHono<{ Bindings: Env; Variables: { logger: RequestLogger } }>
) {
	app.openapi(routeBillingWebhook, handleBillingWebhook as Handler);
	app.openapi(routeBillingStatus, handleBillingStatus as Handler);
	app.openapi(routeBillingQuotaStatus, handleBillingQuotaStatus as Handler);
	app.openapi(
		routeBillingCheckoutCredits,
		handleBillingCheckoutCredits as Handler
	);
	app.openapi(routeBillingRetryLimitStatus, handleRetryLimitStatus as Handler);
	app.openapi(routeBillingCheckout, handleBillingCheckout as Handler);
	app.openapi(routeBillingChangePlan, handleBillingChangePlan as Handler);
	app.openapi(routeBillingPortal, handleBillingPortal as Handler);
}
