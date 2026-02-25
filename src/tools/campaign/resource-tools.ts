import { tool } from "ai";
import { z } from "zod";
import {
	API_CONFIG,
	type ToolResult,
	USER_MESSAGES,
} from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import { AUTH_CODES } from "../../shared-config";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	type ToolExecuteOptions,
} from "../utils";

const listCampaignResourcesSchema = z.object({
	campaignId: commonSchemas.campaignId,
	jwt: commonSchemas.jwt,
});

export const listCampaignResources = tool({
	description: "List all resources in a campaign",
	inputSchema: listCampaignResourcesSchema,
	execute: async (
		input: z.infer<typeof listCampaignResourcesSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";
		console.log("[Tool] listCampaignResources received JWT:", jwt);
		console.log("[Tool] listCampaignResources context:", options);
		console.log("[listCampaignResources] Using toolCallId:", toolCallId);

		try {
			console.log("[listCampaignResources] Making API request");
			const response = await authenticatedFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaignId)
				),
				{
					method: "GET",
					jwt,
				}
			);

			if (!response.ok) {
				const authError = await handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						null,
						AUTH_CODES.INVALID_KEY,
						toolCallId
					);
				}
				return createToolError(
					"Failed to list campaign resources",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			const result = (await response.json()) as {
				resources: Array<{ type: string; id: string; name?: string }>;
			};
			console.log("[listCampaignResources] API data:", result);

			return createToolSuccess(
				`${USER_MESSAGES.CAMPAIGN_RESOURCES_FOUND} ${campaignId}: ${result.resources.length} resource(s)`,
				{ resources: result.resources },
				toolCallId
			);
		} catch (error) {
			console.error("Error listing campaign resources:", error);
			return createToolError(
				"Failed to list campaign resources",
				error,
				500,
				toolCallId
			);
		}
	},
});

const addResourceToCampaignSchema = z.object({
	campaignId: commonSchemas.campaignId,
	resourceId: z.string().describe("The ID of the resource to add"),
	resourceType: z
		.string()
		.describe("The type of resource (e.g., 'document', 'character-sheet')"),
	jwt: commonSchemas.jwt,
});

export const addResourceToCampaign = tool({
	description: "Add a resource to a campaign",
	inputSchema: addResourceToCampaignSchema,
	execute: async (
		input: z.infer<typeof addResourceToCampaignSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, resourceId, resourceType, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";
		console.log("[Tool] addResourceToCampaign received JWT:", jwt);
		console.log("[Tool] addResourceToCampaign context:", options);
		console.log("[addResourceToCampaign] Using toolCallId:", toolCallId);

		try {
			console.log("[addResourceToCampaign] Making API request");
			const response = await authenticatedFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId)
				),
				{
					method: "POST",
					jwt,
					body: JSON.stringify({
						type: resourceType,
						id: resourceId,
						name: resourceId,
					}),
				}
			);

			if (!response.ok) {
				const authError = await handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						null,
						AUTH_CODES.INVALID_KEY,
						toolCallId
					);
				}
				return createToolError(
					"Failed to add resource to campaign",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			console.log("[addResourceToCampaign] Resource added successfully");
			return createToolSuccess(
				`Resource "${resourceId}" has been added to campaign "${campaignId}" successfully.`,
				{ campaignId, resourceId, resourceType },
				toolCallId
			);
		} catch (error) {
			console.error("Error adding resource to campaign:", error);
			return createToolError(
				"Failed to add resource to campaign",
				error,
				500,
				toolCallId
			);
		}
	},
});

const proposeResourceToCampaignSchema = z.object({
	campaignId: commonSchemas.campaignId,
	fileKey: z.string().describe("The file key/ID from the user's library"),
	fileName: z.string().describe("Display name for the file"),
	confirmedLegal: z
		.boolean()
		.describe(
			"Must be true. Before calling, you MUST present the legal notice to the user and get explicit confirmation. The notice: By proposing this file, you grant the campaign GM read access to review it. You confirm you have the right to share this content, the file does not contain malicious/illegal content, and the recipient will be able to download and review it."
		),
	jwt: commonSchemas.jwt,
});

export const proposeResourceToCampaign = tool({
	description:
		"Propose a document from your library for a campaign. Use this when you are an editor player and want to suggest a resource for the GM to approve. Before calling, you MUST present the legal notice to the user and get their explicit confirmation. Only call with confirmedLegal: true after they confirm. The GM will review and can approve or reject.",
	inputSchema: proposeResourceToCampaignSchema,
	execute: async (
		input: z.infer<typeof proposeResourceToCampaignSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, fileKey, fileName, confirmedLegal, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";

		try {
			const response = await authenticatedFetch(
				API_CONFIG.buildUrl(
					API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE_PROPOSALS(campaignId)
				),
				{
					method: "POST",
					jwt,
					body: JSON.stringify({ fileKey, fileName, confirmedLegal }),
				}
			);

			if (!response.ok) {
				const authError = await handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						null,
						AUTH_CODES.INVALID_KEY,
						toolCallId
					);
				}
				const errBody = (await response.json()) as { error?: string };
				return createToolError(
					errBody.error ?? "Failed to propose resource",
					`HTTP ${response.status}`,
					response.status,
					toolCallId
				);
			}

			const result = (await response.json()) as {
				id: string;
				campaignId: string;
				fileKey: string;
				fileName: string;
				status: string;
			};
			return createToolSuccess(
				`"${fileName}" has been proposed for campaign approval. The GM will review and can add it to the campaign.`,
				result,
				toolCallId
			);
		} catch (error) {
			console.error("Error proposing resource to campaign:", error);
			return createToolError(
				"Failed to propose resource to campaign",
				error,
				500,
				toolCallId
			);
		}
	},
});

const removeResourceFromCampaignSchema = z.object({
	campaignId: commonSchemas.campaignId,
	resourceId: z.string().describe("The ID of the resource to remove"),
	jwt: commonSchemas.jwt,
});

export const removeResourceFromCampaign = tool({
	description: "Remove a resource from a campaign",
	inputSchema: removeResourceFromCampaignSchema,
	execute: async (
		input: z.infer<typeof removeResourceFromCampaignSchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const { campaignId, resourceId, jwt } = input;
		const toolCallId = options?.toolCallId ?? "unknown";
		console.log("[Tool] removeResourceFromCampaign received JWT:", jwt);
		console.log("[Tool] removeResourceFromCampaign context:", options);
		console.log("[removeResourceFromCampaign] Using toolCallId:", toolCallId);

		try {
			console.log("[removeResourceFromCampaign] Making API request");
			const response = await authenticatedFetch(
				API_CONFIG.buildUrl(
					`${API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaignId)}/${resourceId}`
				),
				{
					method: "DELETE",
					jwt,
				}
			);

			if (!response.ok) {
				const authError = await handleAuthError(response);
				if (authError) {
					return createToolError(
						authError,
						null,
						AUTH_CODES.INVALID_KEY,
						toolCallId
					);
				}
				return createToolError(
					"Failed to remove resource from campaign",
					`HTTP ${response.status}: ${await response.text()}`,
					500,
					toolCallId
				);
			}

			console.log("[removeResourceFromCampaign] Resource removed successfully");
			return createToolSuccess(
				`Resource "${resourceId}" has been removed from campaign "${campaignId}" successfully.`,
				{ campaignId, resourceId },
				toolCallId
			);
		} catch (error) {
			console.error("Error removing resource from campaign:", error);
			return createToolError(
				"Failed to remove resource from campaign",
				error,
				500,
				toolCallId
			);
		}
	},
});
