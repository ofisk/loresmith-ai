import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../shared";

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
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      console.log("[listCampaigns] Using JWT:", jwt);
      console.log("apiBaseUrl", apiBaseUrl);
      const response = await fetch(`${apiBaseUrl}/campaigns`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
      });
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
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      console.log("[createCampaign] Using JWT:", jwt);
      const response = await fetch(`${apiBaseUrl}/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ name }),
      });
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

export const campaignTools = {
  listCampaigns,
  createCampaign,
};
