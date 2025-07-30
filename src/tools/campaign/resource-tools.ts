import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult, USER_MESSAGES } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvironment,
  isDurableObjectContext,
} from "../utils";

// Resource management tools

export const listCampaignResources = tool({
  description: "List all resources in a campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }): Promise<ToolResult> => {
    console.log("[Tool] listCampaignResources received JWT:", jwt);

    try {
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaignId)
        ),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt && { Authorization: `Bearer ${jwt}` }),
          },
        }
      );

      if (!response.ok) {
        return createToolError(
          `${USER_MESSAGES.FAILED_TO_FETCH_RESOURCES}: ${response.status}`,
          { error: `HTTP ${response.status}` }
        );
      }

      const result = (await response.json()) as {
        resources: Array<{
          type: string;
          id: string;
          name?: string;
        }>;
      };

      return createToolSuccess(
        `${USER_MESSAGES.CAMPAIGN_RESOURCES_FOUND} ${campaignId}: ${result.resources.length} resource(s)`,
        { resources: result.resources }
      );
    } catch (error) {
      console.error("Error listing campaign resources:", error);
      return createToolError(
        `${USER_MESSAGES.FAILED_TO_FETCH_RESOURCES}: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const addResourceToCampaign = tool({
  description:
    "Add a resource to a campaign. If campaignId is not provided, will attempt to find the best matching campaign based on the resource name or type.",
  parameters: z.object({
    campaignId: z
      .string()
      .optional()
      .describe(
        "The ID of the campaign to add the resource to (optional - will auto-detect if not provided)"
      ),
    resourceType: z
      .enum(["pdf", "character", "note", "image"])
      .describe("The type of resource to add"),
    resourceId: z.string().describe("The ID of the resource to add"),
    resourceName: z
      .string()
      .optional()
      .describe("The name of the resource (optional)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({
    campaignId,
    resourceType,
    resourceId,
    resourceName,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] addResourceToCampaign received JWT:", jwt);

    try {
      let targetCampaignId = campaignId;

      // If no campaignId provided, try to find the best matching campaign
      if (!targetCampaignId) {
        try {
          const campaignsResponse = await fetch(
            API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                ...(jwt && { Authorization: `Bearer ${jwt}` }),
              },
            }
          );

          if (campaignsResponse.ok) {
            const campaignsResult = (await campaignsResponse.json()) as {
              campaigns: Array<{
                campaignId: string;
                name: string;
              }>;
            };

            if (
              campaignsResult.campaigns &&
              campaignsResult.campaigns.length > 0
            ) {
              // If there's only one campaign, use it
              if (campaignsResult.campaigns.length === 1) {
                targetCampaignId = campaignsResult.campaigns[0].campaignId;
              } else {
                // Try to find a campaign that matches the resource name
                const resourceNameLower = (
                  resourceName || resourceId
                ).toLowerCase();
                const matchingCampaign = campaignsResult.campaigns.find(
                  (campaign) =>
                    campaign.name.toLowerCase().includes(resourceNameLower) ||
                    resourceNameLower.includes(campaign.name.toLowerCase())
                );

                if (matchingCampaign) {
                  targetCampaignId = matchingCampaign.campaignId;
                } else {
                  // Use the first campaign as fallback
                  targetCampaignId = campaignsResult.campaigns[0].campaignId;
                }
              }
            }
          }
        } catch (error) {
          console.error("Error finding matching campaign:", error);
        }
      }

      if (!targetCampaignId) {
        return createToolError(
          "No campaign found. Please create a campaign first or specify a campaign ID.",
          { error: "No campaign available" }
        );
      }

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(targetCampaignId)
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt && { Authorization: `Bearer ${jwt}` }),
          },
          body: JSON.stringify({
            type: resourceType,
            id: resourceId,
            name: resourceName,
          }),
        }
      );

      if (!response.ok) {
        return createToolError(
          `${USER_MESSAGES.FAILED_TO_ADD_RESOURCE}: ${response.status}`,
          { error: `HTTP ${response.status}` }
        );
      }

      const result = (await response.json()) as {
        resources: Array<{
          type: string;
          id: string;
          name?: string;
        }>;
      };

      return createToolSuccess(
        `${USER_MESSAGES.RESOURCE_ADDED} ${targetCampaignId}: ${resourceId}`,
        { resources: result.resources }
      );
    } catch (error) {
      console.error("Error adding resource to campaign:", error);
      return createToolError(
        `Error adding resource to campaign: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
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
    console.log("[Tool] removeResourceFromCampaign received:", {
      campaignId,
      resourceId,
    });
    console.log("[Tool] removeResourceFromCampaign context:", context);
    try {
      // Check if we have access to the environment through context
      const env = getEnvironment(context);
      const isDO = isDurableObjectContext(context);

      if (isDO && env?.CampaignManager) {
        console.log(
          "[removeResourceFromCampaign] Running in Durable Object context, calling CampaignManager directly"
        );

        const username = extractUsernameFromJwt(jwt);
        console.log(
          "[removeResourceFromCampaign] Extracted username from JWT:",
          username
        );

        const campaignManager = env.CampaignManager;
        console.log(
          "[removeResourceFromCampaign] CampaignManager binding:",
          campaignManager
        );
        const campaignManagerId = campaignManager.idFromName(username);
        console.log(
          "[removeResourceFromCampaign] CampaignManager ID:",
          campaignManagerId.toString()
        );
        const campaignManagerStub = campaignManager.get(campaignManagerId);
        console.log(
          "[removeResourceFromCampaign] CampaignManager stub:",
          campaignManagerStub
        );
        const requestUrl = `${new URL("https://dummy-host").origin}/campaigns/${campaignId}/resources/${resourceId}`;
        console.log(
          "[removeResourceFromCampaign] Calling CampaignManager with URL:",
          requestUrl
        );
        const response = await campaignManagerStub.fetch(requestUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        });
        console.log(
          "[removeResourceFromCampaign] CampaignManager response status:",
          response.status
        );
        console.log(
          "[removeResourceFromCampaign] CampaignManager response ok:",
          response.ok
        );
        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            "[removeResourceFromCampaign] CampaignManager error response:",
            errorText
          );
          return createToolError(
            `Failed to remove resource: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }
        console.log(
          "[removeResourceFromCampaign] Resource removed successfully"
        );
        return createToolSuccess(
          `Successfully removed resource ${resourceId} from campaign ${campaignId}`,
          {
            campaignId,
            resourceId,
            removed: true,
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[removeResourceFromCampaign] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(campaignId).replace(
              "/resource",
              `/resources/${resourceId}`
            )
          ),
          {
            method: "DELETE",
            jwt,
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(authError, {
              error: `HTTP ${response.status}`,
            });
          }
          return createToolError(
            `Failed to remove resource: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        return createToolSuccess(
          `Successfully removed resource ${resourceId} from campaign ${campaignId}`,
          {
            campaignId,
            resourceId,
            removed: true,
          }
        );
      }
    } catch (error) {
      console.error("Error removing resource from campaign:", error);
      return createToolError(
        `Failed to remove resource: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
