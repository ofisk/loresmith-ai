import { z } from "@hono/zod-openapi";
import { ErrorSchema } from "./common";

export const CheckoutCreditsBodySchema = z
	.object({
		amount: z.union([z.literal(50000), z.literal(200000), z.literal(500000)]),
	})
	.openapi("CheckoutCreditsBody");

export const CheckoutBodySchema = z
	.object({
		tier: z.enum(["basic", "pro"]),
		interval: z.enum(["monthly", "annual"]),
	})
	.openapi("CheckoutBody");

export const ChangePlanBodySchema = z
	.object({
		tier: z.enum(["basic", "pro"]),
	})
	.openapi("ChangePlanBody");

export const CheckoutUrlSchema = z
	.object({ url: z.string().url().nullable() })
	.openapi("CheckoutUrl");

export const ErrorResponseContent = {
	"application/json": { schema: ErrorSchema },
} as const;
