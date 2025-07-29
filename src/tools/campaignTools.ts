import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  AUTH_CODES,
  type ToolResult,
  USER_MESSAGES,
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
  execute: async ({ name, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] createCampaign received JWT:", jwt);
    console.log("[Tool] createCampaign context:", context);
    try {
      console.log("[createCampaign] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[createCampaign] Environment from context:", !!env);
      console.log(
        "[createCampaign] CampaignManager binding exists:",
        env?.CampaignManager !== undefined
      );

      if (env?.CampaignManager) {
        console.log(
          "[createCampaign] Running in Durable Object context, calling CampaignManager directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[createCampaign] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        const campaignManager = env.CampaignManager;
        console.log(
          "[createCampaign] CampaignManager binding:",
          campaignManager
        );
        const campaignManagerId = campaignManager.idFromName(username);
        console.log(
          "[createCampaign] CampaignManager ID:",
          campaignManagerId.toString()
        );
        const campaignManagerStub = campaignManager.get(campaignManagerId);
        console.log(
          "[createCampaign] CampaignManager stub:",
          campaignManagerStub
        );
        const requestUrl = `${new URL("https://dummy-host").origin}/campaigns`;
        console.log(
          "[createCampaign] Calling CampaignManager with URL:",
          requestUrl
        );
        const response = await campaignManagerStub.fetch(requestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        console.log(
          "[createCampaign] CampaignManager response status:",
          response.status
        );
        console.log(
          "[createCampaign] CampaignManager response ok:",
          response.ok
        );
        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            "[createCampaign] CampaignManager error response:",
            errorText
          );
          return {
            code: AUTH_CODES.ERROR,
            message: `${USER_MESSAGES.FAILED_TO_CREATE_CAMPAIGN}: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }
        const result = await response.json();
        console.log("[createCampaign] CampaignManager result:", result);
        return {
          code: AUTH_CODES.SUCCESS,
          message: `${USER_MESSAGES.CAMPAIGN_CREATED} "${name}" with ID: ${result.campaign.campaignId}`,
          data: { campaign: result.campaign },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[createCampaign] Running in HTTP context, making API request"
        );
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
      }
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
  description:
    "List all resources in a campaign or across all campaigns if no specific campaign is provided",
  parameters: z.object({
    campaignId: z
      .string()
      .optional()
      .describe(
        "The ID of the campaign to list resources for (optional - will list all campaigns if not provided)"
      ),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listCampaignResources received JWT:", jwt);
    console.log("[Tool] listCampaignResources context:", context);
    try {
      console.log("[listCampaignResources] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[listCampaignResources] Environment from context:", !!env);
      console.log(
        "[listCampaignResources] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[listCampaignResources] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[listCampaignResources] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        if (campaignId) {
          // Verify campaign exists and belongs to user
          const campaignResult = await env.DB.prepare(
            "SELECT id FROM campaigns WHERE id = ? AND username = ?"
          )
            .bind(campaignId, username)
            .first();

          if (!campaignResult) {
            return {
              code: AUTH_CODES.ERROR,
              message: "Campaign not found",
              data: { error: "Campaign not found" },
            };
          }

          // For now, return a simple response since resources are not stored in the database yet
          console.log(
            "[listCampaignResources] Listing resources for campaign:",
            campaignId
          );

          return {
            code: AUTH_CODES.SUCCESS,
            message: `Found 0 resources for campaign ${campaignId}`,
            data: {
              resources: [],
              campaignId,
            },
          };
        } else {
          // No specific campaign ID provided, list all campaigns for the user
          const campaignsResult = await env.DB.prepare(
            "SELECT id, name FROM campaigns WHERE username = ?"
          )
            .bind(username)
            .all();

          console.log(
            "[listCampaignResources] Listing all campaigns for user:",
            username
          );

          return {
            code: AUTH_CODES.SUCCESS,
            message: `Found ${campaignsResult.results?.length || 0} campaigns for user. No resources are currently stored in the database.`,
            data: {
              campaigns: campaignsResult.results || [],
              resources: [],
              totalCampaigns: campaignsResult.results?.length || 0,
            },
          };
        }
      } else {
        // Fall back to HTTP API
        console.log(
          "[listCampaignResources] Running in HTTP context, making API request"
        );

        if (!campaignId) {
          return {
            code: AUTH_CODES.ERROR,
            message:
              "No campaign ID provided and HTTP fallback not supported for listing all campaigns",
            data: { error: "Campaign ID required for HTTP API" },
          };
        }

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
        console.log(
          "[listCampaignResources] Response status:",
          response.status
        );
        if (!response.ok) {
          return {
            code: AUTH_CODES.ERROR,
            message: `${USER_MESSAGES.FAILED_TO_FETCH_RESOURCES}: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }
        const result = (await response.json()) as {
          resources: Array<{
            resourceId: string;
            type: string;
            name: string;
            description?: string;
            createdAt: string;
          }>;
        };

        if (!result.resources || result.resources.length === 0) {
          return {
            code: AUTH_CODES.SUCCESS,
            message: USER_MESSAGES.NO_RESOURCES,
            data: { resources: [], empty: true },
          };
        }

        return {
          code: AUTH_CODES.SUCCESS,
          message: `${USER_MESSAGES.RESOURCES_FOUND} ${result.resources.length}: ${result.resources.map((r) => r.name).join(", ")}`,
          data: {
            resources: result.resources,
            empty: false,
            count: result.resources.length,
          },
        };
      }
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

export const campaignTools = {
  listCampaigns,
  createCampaign,
  listCampaignResources,
  addResourceToCampaign,
  showCampaignDetails,
};
