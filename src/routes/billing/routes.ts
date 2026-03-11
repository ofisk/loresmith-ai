import { createRoute, z } from "@hono/zod-openapi";
import { requireUserJwt } from "@/routes/auth";
import { toApiRoutePath } from "@/routes/env";
import {
	ChangePlanBodySchema,
	CheckoutBodySchema,
	CheckoutCreditsBodySchema,
	CheckoutUrlSchema,
	ErrorResponseContent,
} from "@/routes/schemas/billing";
import { API_CONFIG } from "@/shared-config";

const Error400 = {
	400: { content: ErrorResponseContent, description: "Bad request" },
} as const;
const Error401 = {
	401: { content: ErrorResponseContent, description: "Unauthorized" },
} as const;
const Error503 = {
	503: { content: ErrorResponseContent, description: "Service unavailable" },
} as const;

const BillingStatusSchema = z
	.object({
		tier: z.string(),
		isAdmin: z.boolean(),
		status: z.string().nullable(),
		currentPeriodEnd: z.string().nullable(),
		limits: z.record(z.string(), z.unknown()),
		monthlyUsage: z.number().optional(),
		creditsRemaining: z.number().optional(),
	})
	.openapi("BillingStatus");

const QuotaStatusSchema = z
	.object({
		tier: z.string(),
		allowed: z.boolean(),
		wouldExceed: z.boolean().optional(),
		monthlyUsage: z.number().optional(),
		monthlyLimit: z.number().optional(),
		creditsRemaining: z.number().optional(),
		reason: z.string().optional(),
		nextResetAt: z.string().optional(),
	})
	.openapi("QuotaStatus");

const RetryLimitStatusSchema = z
	.object({
		status: z.record(
			z.string(),
			z.object({
				canRetry: z.boolean(),
				reason: z.string().optional(),
			})
		),
	})
	.openapi("RetryLimitStatus");

const ChangePlanSuccessSchema = z
	.object({
		success: z.literal(true),
		tier: z.string(),
		pendingPayment: z.boolean(),
		message: z.string(),
	})
	.openapi("ChangePlanSuccess");

const WebhookReceivedSchema = z
	.object({ received: z.literal(true) })
	.openapi("WebhookReceived");

export const routeBillingWebhook = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.WEBHOOK),
	responses: {
		200: {
			content: { "application/json": { schema: WebhookReceivedSchema } },
			description: "Webhook received",
		},
		...Error400,
		...Error503,
	},
});

export const routeBillingStatus = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.STATUS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: {
		200: {
			content: { "application/json": { schema: BillingStatusSchema } },
			description: "Billing status",
		},
		...Error401,
	},
});

export const routeBillingQuotaStatus = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.QUOTA_STATUS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		query: z.object({
			estimatedTokens: z.coerce.number().min(0).max(100_000).optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: QuotaStatusSchema } },
			description: "Quota status",
		},
		...Error401,
	},
});

export const routeBillingCheckoutCredits = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.CHECKOUT_CREDITS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: CheckoutCreditsBodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: CheckoutUrlSchema } },
			description: "Checkout URL",
		},
		...Error400,
		...Error401,
		...Error503,
	},
});

export const routeBillingRetryLimitStatus = createRoute({
	method: "get",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.RETRY_LIMIT_STATUS),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		query: z.object({
			fileKeys: z.string().optional(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: RetryLimitStatusSchema } },
			description: "Retry limit status",
		},
		...Error401,
	},
});

export const routeBillingCheckout = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.CHECKOUT),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: CheckoutBodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: { "application/json": { schema: CheckoutUrlSchema } },
			description: "Checkout URL",
		},
		...Error400,
		...Error401,
		...Error503,
	},
});

export const routeBillingChangePlan = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.CHANGE_PLAN),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	request: {
		body: {
			content: {
				"application/json": {
					schema: ChangePlanBodySchema,
				},
			},
		},
	},
	responses: {
		200: {
			content: {
				"application/json": { schema: ChangePlanSuccessSchema },
			},
			description: "Plan change initiated",
		},
		...Error400,
		...Error401,
		...Error503,
	},
});

export const routeBillingPortal = createRoute({
	method: "post",
	path: toApiRoutePath(API_CONFIG.ENDPOINTS.BILLING.PORTAL),
	middleware: [requireUserJwt],
	security: [{ bearerAuth: [] }],
	responses: {
		200: {
			content: { "application/json": { schema: CheckoutUrlSchema } },
			description: "Portal URL",
		},
		...Error400,
		...Error401,
	},
});
