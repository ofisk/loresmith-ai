import { tool } from "ai";
import { z } from "zod";
import { getDAOFactory } from "@/dao/dao-factory";
import type { ToolResult } from "../../app-constants";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	requireCampaignAccessForTool,
	type ToolEnv,
	type ToolExecuteOptions,
} from "../utils";

const getRecentSessionDigestsParameters = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
	limit: z
		.number()
		.int()
		.positive()
		.max(10)
		.optional()
		.default(3)
		.describe("Maximum number of recent digests to retrieve"),
});

export const getRecentSessionDigestsTool = tool({
	description:
		"Get recent session digests for a campaign. Use this to understand what happened in recent sessions and provide context-aware next-step suggestions.",
	inputSchema: getRecentSessionDigestsParameters,
	execute: async (
		input: z.infer<typeof getRecentSessionDigestsParameters>,
		options: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt, limit } = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			if (!jwt) {
				return createToolError(
					"Authentication required",
					"JWT token is required",
					401,
					toolCallId
				);
			}

			const env = options?.env;
			if (!env) {
				return createToolError(
					"Environment not available",
					"Server environment is required",
					500,
					toolCallId
				);
			}

			const daoFactory = getDAOFactory(env);
			const access = await requireCampaignAccessForTool({
				env: env as ToolEnv,
				campaignId,
				jwt,
				toolCallId,
			});
			if ("toolCallId" in access) {
				return access;
			}

			const allDigests =
				await daoFactory.sessionDigestDAO.getSessionDigestsByCampaign(
					campaignId
				);

			const recentDigests = allDigests.slice(0, limit);

			return createToolSuccess(
				`Retrieved ${recentDigests.length} recent session digest(s)`,
				{
					digests: recentDigests,
					count: recentDigests.length,
					total: allDigests.length,
				},
				toolCallId
			);
		} catch (error) {
			console.error("[getRecentSessionDigestsTool] Error:", error);
			return createToolError(
				"Failed to get recent session digests",
				error instanceof Error ? error.message : "Unknown error",
				500,
				toolCallId
			);
		}
	},
});
