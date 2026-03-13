import { tool } from "ai";
import { z } from "zod";
import { getDAOFactory } from "@/dao/dao-factory";
import { authenticatedFetch, handleAuthError } from "@/lib/tool-auth";
import { API_CONFIG, AUTH_CODES } from "@/shared-config";
import {
	canSeeSpoilersForCampaignRole,
	commonSchemas,
	createToolError,
	createToolSuccess,
	requireCampaignAccessByUserIdForTool,
	runWithEnvOrApi,
	type ToolEnv,
	type ToolExecuteOptions,
} from "@/tools/utils";
import { buildChecklistStatusFromRecords } from "./checklist-utils";

const getChecklistStatusSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
});

/**
 * Get checklist status for a campaign
 * Returns structured status and summaries for all tracked checklist items
 */
export const getChecklistStatusTool = tool({
	description:
		"Get the current status and summaries for all campaign planning checklist items. This provides a quick, structured view of what's been completed, what's incomplete, and brief summaries of what exists for each item. Use this instead of doing multiple broad searches when checking what checklist items are already established. IMPORTANT: Status marked as 'partial' with 'Preliminary:' summaries are based on entity counts only - you should investigate further using searchCampaignContext to verify if items are truly complete (e.g., factions may exist but not be well-defined or integrated into the campaign).",
	inputSchema: getChecklistStatusSchema,
	execute: async (
		input: z.infer<typeof getChecklistStatusSchema>,
		options?: ToolExecuteOptions
	): Promise<unknown> => {
		const { campaignId, jwt } = input;
		const toolCallId = options?.toolCallId ?? crypto.randomUUID();

		try {
			return await runWithEnvOrApi({
				context: options,
				jwt,
				apiCall: async () => {
					const response = await authenticatedFetch(
						API_CONFIG.buildUrl(
							API_CONFIG.ENDPOINTS.CAMPAIGNS.CHECKLIST_STATUS(campaignId)
						),
						{ method: "GET", jwt }
					);

					if (!response.ok) {
						const authError = handleAuthError(response);
						if (authError) {
							return createToolError(
								authError,
								"Authentication failed",
								response.status,
								toolCallId
							);
						}
						const errorData = (await response.json()) as {
							error?: string;
							message?: string;
						};
						return createToolError(
							errorData.error || "Failed to get checklist status",
							errorData.message || "Unknown error",
							response.status,
							toolCallId
						);
					}

					const data = (await response.json()) as {
						records: Array<{
							checklistItemKey: string;
							status: string;
							summary: string | null;
						}>;
					};
					const statusRecords = data.records ?? [];
					const built = buildChecklistStatusFromRecords(statusRecords);

					return createToolSuccess(
						built.summaryText,
						{
							statusByItem: built.statusByItem,
							completeCount: built.completeItems.length,
							partialCount: built.partialItems.length,
							incompleteCount: built.incompleteItems.length,
							totalCount: statusRecords.length,
						},
						toolCallId
					);
				},
				authErrorResult: createToolError(
					"Invalid authentication token",
					"Authentication failed",
					AUTH_CODES.INVALID_KEY,
					toolCallId
				),
				dbCall: async (env, userId) => {
					const daoFactory = getDAOFactory(env);
					const campaignDAO = daoFactory.campaignDAO;
					const checklistStatusDAO = daoFactory.checklistStatusDAO;

					const access = await requireCampaignAccessByUserIdForTool({
						env: env as ToolEnv,
						campaignId,
						userId,
						toolCallId,
					});
					if ("toolCallId" in access) return access;

					const role = await campaignDAO.getCampaignRole(campaignId, userId);
					if (!canSeeSpoilersForCampaignRole(role)) {
						return createToolError(
							"This action is not available.",
							"This action is limited to GM tools.",
							403,
							toolCallId
						);
					}

					const statusRecords = await checklistStatusDAO.getChecklistStatus(
						campaignId as string
					);
					const built = buildChecklistStatusFromRecords(statusRecords);

					return createToolSuccess(
						built.summaryText,
						{
							statusByItem: built.statusByItem,
							completeCount: built.completeItems.length,
							partialCount: built.partialItems.length,
							incompleteCount: built.incompleteItems.length,
							totalCount: statusRecords.length,
						},
						toolCallId
					);
				},
			});
		} catch (error) {
			return createToolError(
				"Failed to get checklist status",
				error instanceof Error ? error.message : String(error),
				500,
				toolCallId
			);
		}
	},
});
