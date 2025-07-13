import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../constants";

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
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );
      console.log("[listCampaigns] Response status:", response.status);
      if (!response.ok) {
        console.log(JSON.stringify(response));
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to fetch campaigns: ${response.status}`,
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
          message:
            "You don't currently have any campaigns. You can create a new campaign using the createCampaign tool.",
          data: { campaigns: [], empty: true },
        };
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Found ${result.campaigns.length} campaign(s): ${result.campaigns.map((c) => c.name).join(", ")}`,
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
        message: `Error listing campaigns: ${error instanceof Error ? error.message : String(error)}`,
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
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ name }),
        }
      );
      console.log("[createCampaign] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to create campaign: ${response.status}`,
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
        message: `Campaign "${name}" created successfully with ID: ${result.campaign.campaignId}`,
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
          message: `Failed to fetch campaign resources: ${response.status}`,
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
        message: `Found ${result.resources.length} resource(s) in campaign ${campaignId}`,
        data: { resources: result.resources },
      };
    } catch (error) {
      console.error("Error listing campaign resources:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error listing campaign resources: ${error instanceof Error ? error.message : String(error)}`,
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
          message: `Failed to add resource to campaign: ${response.status}`,
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
        message: `Resource ${resourceId} added successfully to campaign ${targetCampaignId}`,
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
          message: `Failed to fetch campaign details: ${response.status}`,
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
        message: `Campaign "${result.campaign.name}" details: ${result.campaign.resources.length} resources`,
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
