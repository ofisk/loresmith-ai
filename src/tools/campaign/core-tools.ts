import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult, USER_MESSAGES } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";
import { AUTH_CODES } from "../../shared";

// Core campaign operations

export const listCampaigns = tool({
  description: "List all campaigns for the current user",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listCampaigns received JWT:", jwt);
    console.log("[Tool] listCampaigns context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[listCampaigns] Using toolCallId:", toolCallId);

    try {
      console.log("[listCampaigns] Making API request");
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "GET",
          jwt,
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            {
              error: `HTTP ${response.status}`,
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }
        return createToolError(
          `Failed to list campaigns: ${response.status}`,
          {
            error: `HTTP ${response.status}`,
          },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const data = (await response.json()) as { campaigns?: any[] };
      console.log("[listCampaigns] API data:", data);

      if (data.campaigns && data.campaigns.length > 0) {
        return createToolSuccess(
          USER_MESSAGES.RESOURCES_FOUND,
          {
            campaigns: data.campaigns,
            empty: false,
          },
          toolCallId
        );
      } else {
        return createToolSuccess(
          USER_MESSAGES.NO_RESOURCES,
          {
            campaigns: [],
            empty: true,
          },
          toolCallId
        );
      }
    } catch (error) {
      console.error("Error listing campaigns:", error);
      return createToolError(
        `Failed to list campaigns: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

export const createCampaign = tool({
  description: "Create a new campaign",
  parameters: z.object({
    name: z.string(),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ name, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] createCampaign received:", { name, jwt });
    console.log("[Tool] createCampaign context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[createCampaign] Using toolCallId:", toolCallId);

    try {
      console.log("[createCampaign] Making API request");
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({ name }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            {
              error: `HTTP ${response.status}`,
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }
        return createToolError(
          `Failed to create campaign: ${response.status}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const data = (await response.json()) as { campaignId: string };
      console.log("[createCampaign] API data:", data);

      return createToolSuccess(
        `The campaign "${name}" has been created successfully! Campaign ID: ${data.campaignId} Created At: ${new Date().toLocaleDateString()}`,
        {
          campaignId: data.campaignId,
          name,
          createdAt: new Date().toISOString(),
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error creating campaign:", error);
      return createToolError(
        `Failed to create campaign: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

export const showCampaignDetails = tool({
  description: "Show detailed information about a specific campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] showCampaignDetails received:", { campaignId, jwt });
    console.log("[Tool] showCampaignDetails context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[showCampaignDetails] Using toolCallId:", toolCallId);

    try {
      console.log("[showCampaignDetails] Making API request");
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "GET",
          jwt,
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            {
              error: `HTTP ${response.status}`,
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }
        return createToolError(
          `Failed to get campaign details: ${response.status}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const data = (await response.json()) as {
        name: string;
        campaignId: string;
        createdAt: string;
        resources?: any[];
        status?: string;
      };
      console.log("[showCampaignDetails] API data:", data);

      return createToolSuccess(
        `Campaign Details for "${data.name}":\n\nID: ${data.campaignId}`,
        { campaign: data },
        toolCallId
      );
    } catch (error) {
      console.error("Error getting campaign details:", error);
      return createToolError(
        `Failed to get campaign details: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

export const deleteCampaign = tool({
  description: "Delete a specific campaign",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] deleteCampaign received:", { campaignId, jwt });
    console.log("[Tool] deleteCampaign context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[deleteCampaign] Using toolCallId:", toolCallId);

    try {
      console.log("[deleteCampaign] Making API request");
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "DELETE",
          jwt,
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            {
              error: `HTTP ${response.status}`,
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }
        return createToolError(
          `Failed to delete campaign: ${response.status}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      console.log("[deleteCampaign] Campaign deleted successfully");
      return createToolSuccess(
        `Campaign "${campaignId}" has been deleted successfully.`,
        { campaignId },
        toolCallId
      );
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return createToolError(
        `Failed to delete campaign: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

export const deleteCampaigns = tool({
  description: "Delete all campaigns for the current user",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] deleteCampaigns received JWT:", jwt);
    console.log("[Tool] deleteCampaigns context:", context);
    console.log("[deleteCampaigns] Using JWT:", jwt);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[deleteCampaigns] Using toolCallId:", toolCallId);

    try {
      console.log("[deleteCampaigns] Making API request");
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE),
        {
          method: "DELETE",
          jwt,
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            {
              error: `HTTP ${response.status}`,
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }
        return createToolError(
          `Failed to delete campaigns: ${response.status}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      console.log("[deleteCampaigns] All campaigns deleted successfully");
      return createToolSuccess(
        "All campaigns have been deleted successfully.",
        { deleted: true },
        toolCallId
      );
    } catch (error) {
      console.error("Error deleting campaigns:", error);
      return createToolError(
        `Failed to delete campaigns: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
