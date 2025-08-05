import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult, USER_MESSAGES } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import { AUTH_CODES } from "../../shared";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";

export const listCampaignResources = tool({
  description: "List all resources in a campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listCampaignResources received JWT:", jwt);
    console.log("[Tool] listCampaignResources context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
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

export const addResourceToCampaign = tool({
  description: "Add a resource to a campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    resourceId: z.string().describe("The ID of the resource to add"),
    resourceType: z
      .string()
      .describe("The type of resource (e.g., 'pdf', 'character-sheet')"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, resourceId, resourceType, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] addResourceToCampaign received JWT:", jwt);
    console.log("[Tool] addResourceToCampaign context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[addResourceToCampaign] Using toolCallId:", toolCallId);

    try {
      console.log("[addResourceToCampaign] Making API request");
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            resourceId,
            resourceType,
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

export const removeResourceFromCampaign = tool({
  description: "Remove a resource from a campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    resourceId: z.string().describe("The ID of the resource to remove"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { campaignId, resourceId, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] removeResourceFromCampaign received JWT:", jwt);
    console.log("[Tool] removeResourceFromCampaign context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
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
