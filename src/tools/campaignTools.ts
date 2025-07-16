import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  AUTH_CODES,
  USER_MESSAGES,
  type ToolResult,
} from "../constants";
import { authenticatedFetch, handleAuthError } from "../lib/toolAuth";

// Campaign-related tool definitions

const listCampaigns = tool({
  description: "List all campaigns for the current user",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    console.log("[Tool] listCampaigns received JWT:", jwt);
    try {
      console.log("[listCampaigns] Using JWT:", jwt);
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "GET",
          jwt,
        }
      );
      console.log("[listCampaigns] Response status:", response.status);
      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_FETCH_CAMPAIGNS}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        campaigns: Array<{
          campaignId: string;
          name: string;
          createdAt: string;
          updatedAt: string;
        }>;
      };

      if (!result.campaigns || result.campaigns.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message: USER_MESSAGES.NO_CAMPAIGNS,
          data: { campaigns: [], empty: true },
        };
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGNS_FOUND} ${result.campaigns.length}: ${result.campaigns.map((c) => c.name).join(", ")}`,
        data: {
          campaigns: result.campaigns,
          empty: false,
          count: result.campaigns.length,
        },
      };
    } catch (error) {
      console.error("Error listing campaigns:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `${USER_MESSAGES.FAILED_TO_FETCH_CAMPAIGNS}: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const createCampaign = tool({
  description: "Create a new campaign with the specified name",
  parameters: z.object({
    name: z.string().describe("The name of the campaign to create"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ name, jwt }): Promise<ToolResult> => {
    console.log("[Tool] createCampaign received JWT:", jwt);
    try {
      console.log("[createCampaign] Using JWT:", jwt);
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({ name }),
        }
      );
      console.log("[createCampaign] Response status:", response.status);
      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_CREATE_CAMPAIGN}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        campaign: {
          campaignId: string;
          name: string;
          createdAt: string;
          updatedAt: string;
        };
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGN_CREATED} "${name}" with ID: ${result.campaign.campaignId}`,
        data: { campaign: result.campaign },
      };
    } catch (error) {
      console.error("Error creating campaign:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error creating campaign: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const listCampaignResources = tool({
  description: "List all resources in a campaign",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to list resources for"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignId, jwt }): Promise<ToolResult> => {
    console.log("[Tool] listCampaignResources received JWT:", jwt);
    try {
      console.log("[listCampaignResources] Using JWT:", jwt);
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCES(campaignId)
        ),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );
      console.log("[listCampaignResources] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_FETCH_RESOURCES}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        resources: Array<{
          type: string;
          id: string;
          name?: string;
        }>;
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGN_RESOURCES_FOUND} ${campaignId}: ${result.resources.length} resource(s)`,
        data: { resources: result.resources },
      };
    } catch (error) {
      console.error("Error listing campaign resources:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `${USER_MESSAGES.FAILED_TO_FETCH_RESOURCES}: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const addResourceToCampaign = tool({
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
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
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
      console.log("[addResourceToCampaign] Using JWT:", jwt);

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
                ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
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
        return {
          code: AUTH_CODES.ERROR,
          message:
            "No campaign found. Please create a campaign first or specify a campaign ID.",
          data: { error: "No campaign available" },
        };
      }

      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.RESOURCE(targetCampaignId)
        ),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            type: resourceType,
            id: resourceId,
            name: resourceName,
          }),
        }
      );
      console.log("[addResourceToCampaign] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_ADD_RESOURCE}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        resources: Array<{
          type: string;
          id: string;
          name?: string;
        }>;
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.RESOURCE_ADDED} ${targetCampaignId}: ${resourceId}`,
        data: { resources: result.resources },
      };
    } catch (error) {
      console.error("Error adding resource to campaign:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error adding resource to campaign: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const showCampaignDetails = tool({
  description:
    "Show detailed information about a campaign including metadata and resources",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to show details for"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignId, jwt }): Promise<ToolResult> => {
    console.log("[Tool] showCampaignDetails received JWT:", jwt);
    try {
      console.log("[showCampaignDetails] Using JWT:", jwt);
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );
      console.log("[showCampaignDetails] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_FETCH_DETAILS}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        campaign: {
          campaignId: string;
          name: string;
          createdAt: string;
          updatedAt: string;
          resources: Array<{
            type: string;
            id: string;
            name?: string;
          }>;
        };
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGN_DETAILS} "${result.campaign.name}": ${result.campaign.resources.length} resources`,
        data: { campaign: result.campaign },
      };
    } catch (error) {
      console.error("Error fetching campaign details:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error fetching campaign details: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const deleteCampaign = tool({
  description:
    "Delete a campaign by its ID (user-specific - only deletes campaigns owned by the authenticated user)",
  parameters: z.object({
    campaignId: z.string().describe("The ID of the campaign to delete"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignId, jwt }): Promise<ToolResult> => {
    console.log("[Tool] deleteCampaign received JWT:", jwt);
    try {
      console.log("[deleteCampaign] Using JWT:", jwt);

      // First, verify that the campaign exists and belongs to the user
      const verifyResponse = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "GET",
          jwt,
        }
      );

      if (!verifyResponse.ok) {
        if (verifyResponse.status === 404) {
          return {
            code: AUTH_CODES.ERROR,
            message:
              "Campaign not found or you don't have permission to access it.",
            data: { error: "Campaign not found" },
          };
        }
        const authError = handleAuthError(verifyResponse);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${verifyResponse.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to verify campaign ownership: ${verifyResponse.status}`,
          data: { error: `HTTP ${verifyResponse.status}` },
        };
      }

      // If we get here, the campaign exists and belongs to the user
      // Now proceed with deletion
      const deleteResponse = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "DELETE",
          jwt,
        }
      );

      console.log(
        "[deleteCampaign] Delete response status:",
        deleteResponse.status
      );
      if (!deleteResponse.ok) {
        const authError = handleAuthError(deleteResponse);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${deleteResponse.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_DELETE_CAMPAIGN}: ${deleteResponse.status}`,
          data: { error: `HTTP ${deleteResponse.status}` },
        };
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGN_DELETED} ${campaignId}`,
        data: { campaignId },
      };
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error deleting campaign: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const deleteCampaigns = tool({
  description:
    "Delete multiple campaigns by their IDs (user-specific - only deletes campaigns owned by the authenticated user)",
  parameters: z.object({
    campaignIds: z
      .array(z.string())
      .describe("Array of campaign IDs to delete"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignIds, jwt }): Promise<ToolResult> => {
    console.log("[Tool] deleteCampaigns received JWT:", jwt);
    try {
      console.log("[deleteCampaigns] Using JWT:", jwt);

      // First, verify that all campaigns exist and belong to the user
      const verificationResults = await Promise.allSettled(
        campaignIds.map(async (campaignId) => {
          const verifyResponse = await authenticatedFetch(
            API_CONFIG.buildUrl(
              API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)
            ),
            {
              method: "GET",
              jwt,
            }
          );
          return { campaignId, response: verifyResponse };
        })
      );

      // Check for campaigns that don't exist or don't belong to the user
      const inaccessibleCampaigns: string[] = [];
      const accessibleCampaigns: string[] = [];
      let authError: string | null = null;

      verificationResults.forEach((result, index) => {
        const campaignId = campaignIds[index];
        if (
          result.status === "fulfilled" &&
          result.value &&
          result.value.response
        ) {
          const { response } = result.value;
          if (response.ok) {
            accessibleCampaigns.push(campaignId);
          } else {
            // Check if this is an authentication error
            if (response.status === 401 || response.status === 403) {
              const error = handleAuthError(response);
              if (error && !authError) {
                authError = error;
              }
            }
            inaccessibleCampaigns.push(campaignId);
          }
        } else {
          inaccessibleCampaigns.push(campaignId);
        }
      });

      // If there was an authentication error, return it immediately
      if (authError) {
        return {
          code: AUTH_CODES.INVALID_KEY,
          message: authError,
          data: { error: "HTTP 401" }, // Default to 401, will be overridden by specific error handling
        };
      }

      // If any campaigns are inaccessible, return an error
      if (inaccessibleCampaigns.length > 0) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Cannot delete campaigns: ${inaccessibleCampaigns.join(", ")}. These campaigns either don't exist or you don't have permission to access them.`,
          data: {
            error: "Campaigns not accessible",
            inaccessibleCampaigns,
            accessibleCampaigns,
          },
        };
      }

      // If we get here, all campaigns exist and belong to the user
      // Now proceed with deletion
      const deleteResponse = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "DELETE",
          jwt,
          body: JSON.stringify({ campaignIds }),
        }
      );

      console.log(
        "[deleteCampaigns] Delete response status:",
        deleteResponse.status
      );
      if (!deleteResponse.ok) {
        const authError = handleAuthError(deleteResponse);
        if (authError) {
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${deleteResponse.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_DELETE_CAMPAIGNS}: ${deleteResponse.status}`,
          data: { error: `HTTP ${deleteResponse.status}` },
        };
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGNS_DELETED} ${campaignIds.join(", ")}`,
        data: { campaignIds },
      };
    } catch (error) {
      console.error("Error deleting campaigns:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error deleting campaigns: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

export const campaignTools = {
  listCampaigns,
  createCampaign,
  listCampaignResources,
  addResourceToCampaign,
  showCampaignDetails,
  deleteCampaign,
  deleteCampaigns,
};
