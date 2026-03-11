import { z } from "@hono/zod-openapi";

/** Standard error response body */
export const ErrorSchema = z
	.object({
		error: z.string().describe("Error message"),
		code: z
			.string()
			.optional()
			.describe("Error code for programmatic handling"),
	})
	.openapi("Error");

/** Path param: campaignId */
export const CampaignIdParamSchema = z
	.object({
		campaignId: z
			.string()
			.openapi({ param: { name: "campaignId", in: "path" } }),
	})
	.openapi("CampaignIdParam");

/** Path param: resourceId */
export const ResourceIdParamSchema = z
	.object({
		resourceId: z
			.string()
			.openapi({ param: { name: "resourceId", in: "path" } }),
	})
	.openapi("ResourceIdParam");
