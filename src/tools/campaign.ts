import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  AUTH_CODES,
  type ToolResult,
  USER_MESSAGES,
} from "../constants";
import { authenticatedFetch, handleAuthError } from "../lib/toolAuth";
import type { CampaignData, CampaignResource } from "../types/campaign";
import { campaignContextTools } from "./campaignContext";

export class CampaignTool {
  private campaignManager: DurableObjectNamespace;

  constructor(campaignManager: DurableObjectNamespace) {
    this.campaignManager = campaignManager;
  }

  private getStub(campaignId: string) {
    return this.campaignManager.get(
      this.campaignManager.idFromName(campaignId)
    );
  }

  async getCampaign(campaignId: string): Promise<CampaignData | null> {
    const stub = this.getStub(campaignId);
    const resp = await stub.fetch("https://dummy-host/");
    if (!resp.ok) return null;
    return (await resp.json()) as CampaignData;
  }

  async getResources(campaignId: string): Promise<CampaignResource[] | null> {
    const stub = this.getStub(campaignId);
    const resp = await stub.fetch("https://dummy-host/resources");
    if (!resp.ok) return null;
    const data = (await resp.json()) as { resources: CampaignResource[] };
    return data.resources;
  }

  // Stub: triggerIndexing (not implemented in DO, so just return a dummy response)
  async triggerIndexing(_campaignId: string): Promise<{ success: boolean }> {
    // In a real implementation, this would POST to /index on the DO
    return { success: true };
  }

  // Stub: getContextChunks (not implemented in DO, so just return a dummy response)
  async getContextChunks(_campaignId: string): Promise<string[]> {
    // In a real implementation, this would fetch context chunks from the DO
    return ["[Context chunk 1]", "[Context chunk 2]"];
  }
}

// Campaign-related tool definitions using HTTP API

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
        // Find the first authentication error status code
        let authStatusCode = 401; // Default
        for (const result of verificationResults) {
          if (result.status === "fulfilled" && result.value.response) {
            const { response } = result.value;
            if (response.status === 401 || response.status === 403) {
              authStatusCode = response.status;
              break;
            }
          }
        }
        return {
          code: AUTH_CODES.INVALID_KEY,
          message: authError,
          data: { error: `HTTP ${authStatusCode}` },
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

const searchPdfLibrary = tool({
  description:
    "Search through the user's PDF library for resources relevant to campaign planning, world-building, or specific topics",
  parameters: z.object({
    query: z
      .string()
      .describe("The search query to find relevant PDF resources"),
    context: z
      .string()
      .optional()
      .describe("Additional context about what the user is looking for"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return (default: 5)"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ query, context, limit = 5, jwt }): Promise<ToolResult> => {
    console.log("[Tool] searchPdfLibrary received query:", query);
    try {
      console.log("[searchPdfLibrary] Using JWT:", jwt);

      const searchPayload = {
        query: context ? `${query} ${context}` : query,
        limit,
      };

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.SEARCH),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify(searchPayload),
        }
      );

      console.log("[searchPdfLibrary] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[searchPdfLibrary] Error response:", errorText);
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to search PDF library: ${response.status} - ${errorText}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        results: Array<{
          chunk: {
            id: string;
            file_key: string;
            chunk_text: string;
            chunk_index: number;
            metadata?: Record<string, any>;
          };
          score: number;
          metadata?: Record<string, any>;
        }>;
      };

      if (!result.results || result.results.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message:
            "No relevant resources found in your PDF library for this query.",
          data: { results: [], empty: true },
        };
      }

      // Group results by PDF file and format for better presentation
      const groupedResults = result.results.reduce(
        (acc, item) => {
          const fileName =
            item.chunk.file_key.split("/").pop() || "Unknown PDF";
          if (!acc[fileName]) {
            acc[fileName] = {
              fileName,
              fileKey: item.chunk.file_key,
              chunks: [],
              relevanceScore: 0,
            };
          }
          acc[fileName].chunks.push({
            text: item.chunk.chunk_text,
            score: item.score,
            index: item.chunk.chunk_index,
          });
          acc[fileName].relevanceScore += item.score;
          return acc;
        },
        {} as Record<string, any>
      );

      const sortedResults = Object.values(groupedResults)
        .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Found ${sortedResults.length} relevant resources in your PDF library: ${sortedResults.map((r: any) => r.fileName).join(", ")}`,
        data: {
          results: sortedResults,
          empty: false,
          count: sortedResults.length,
          query,
        },
      };
    } catch (error) {
      console.error("Error searching PDF library:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to search PDF library: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const getPdfLibraryStats = tool({
  description:
    "Get statistics about the user's PDF library to understand available resources",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    console.log("[Tool] getPdfLibraryStats received JWT:", jwt);
    try {
      console.log("[getPdfLibraryStats] Using JWT:", jwt);

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.PDFS),
        {
          method: "GET",
          headers: {
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );

      console.log("[getPdfLibraryStats] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[getPdfLibraryStats] Error response:", errorText);
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to get PDF library stats: ${response.status} - ${errorText}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        pdfs: Array<{
          file_key: string;
          file_name: string;
          description?: string;
          tags?: string[];
          file_size: number;
          created_at: string;
          status: string;
        }>;
      };

      if (!result.pdfs || result.pdfs.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message:
            "Your PDF library is empty. Consider uploading some D&D resources to get started with campaign planning!",
          data: { pdfs: [], empty: true },
        };
      }

      // Analyze the library for campaign planning insights
      const totalFiles = result.pdfs.length;
      const totalSize = result.pdfs.reduce(
        (sum, pdf) => sum + pdf.file_size,
        0
      );
      const processedFiles = result.pdfs.filter(
        (pdf) => pdf.status === "processed"
      ).length;

      // Categorize PDFs by tags and descriptions
      const categories = result.pdfs.reduce(
        (acc, pdf) => {
          const tags = pdf.tags || [];
          const description = pdf.description || "";
          const fileName = pdf.file_name.toLowerCase();

          // Simple categorization logic
          if (
            tags.some((tag) => tag.toLowerCase().includes("monster")) ||
            description.toLowerCase().includes("monster") ||
            fileName.includes("monster")
          ) {
            acc.monsters = (acc.monsters || 0) + 1;
          }
          if (
            tags.some((tag) => tag.toLowerCase().includes("spell")) ||
            description.toLowerCase().includes("spell") ||
            fileName.includes("spell")
          ) {
            acc.spells = (acc.spells || 0) + 1;
          }
          if (
            tags.some((tag) => tag.toLowerCase().includes("adventure")) ||
            description.toLowerCase().includes("adventure") ||
            fileName.includes("adventure")
          ) {
            acc.adventures = (acc.adventures || 0) + 1;
          }
          if (
            tags.some((tag) => tag.toLowerCase().includes("world")) ||
            description.toLowerCase().includes("world") ||
            fileName.includes("world")
          ) {
            acc.worldBuilding = (acc.worldBuilding || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      );

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Your PDF library contains ${totalFiles} files (${processedFiles} processed) with ${(totalSize / 1024 / 1024).toFixed(1)}MB of content. Available categories: ${Object.entries(
          categories
        )
          .map(([cat, count]) => `${cat} (${count})`)
          .join(", ")}`,
        data: {
          pdfs: result.pdfs,
          empty: false,
          stats: {
            totalFiles,
            processedFiles,
            totalSizeMB: totalSize / 1024 / 1024,
            categories,
          },
        },
      };
    } catch (error) {
      console.error("Error getting PDF library stats:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to get PDF library stats: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const planCampaignSession = tool({
  description:
    "Help plan a specific D&D session with detailed suggestions for encounters, NPCs, and story elements",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to plan a session for"),
    sessionType: z
      .string()
      .optional()
      .describe("Type of session (combat, social, exploration, etc.)"),
    playerLevel: z
      .number()
      .optional()
      .describe("Average player level for encounter balancing"),
    sessionLength: z
      .string()
      .optional()
      .describe("Expected session length (2 hours, 4 hours, etc.)"),
    context: z
      .string()
      .optional()
      .describe("Additional context about the campaign or session goals"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({
    campaignId,
    sessionType,
    playerLevel,
    sessionLength,
    context,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] planCampaignSession received:", {
      campaignId,
      sessionType,
      playerLevel,
      sessionLength,
      context,
    });
    try {
      // First, get campaign details to understand the context
      const campaignResponse = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)),
        {
          method: "GET",
          headers: {
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );

      if (!campaignResponse.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to get campaign details: ${campaignResponse.status}`,
          data: { error: `HTTP ${campaignResponse.status}` },
        };
      }

      const campaignData = (await campaignResponse.json()) as {
        campaign?: {
          name: string;
          [key: string]: any;
        };
      };

      // Search for relevant resources based on campaign context
      const searchQuery = `session planning ${sessionType || ""} ${context || ""}`;
      const searchResponse = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.SEARCH),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 3,
          }),
        }
      );

      let resourceSuggestions: any[] = [];
      if (searchResponse.ok) {
        const searchData = (await searchResponse.json()) as {
          results?: any[];
        };
        resourceSuggestions = searchData.results || [];
      }

      // Generate session planning suggestions
      const sessionPlan = {
        campaignName: campaignData.campaign?.name || "Unknown Campaign",
        sessionType: sessionType || "balanced",
        playerLevel: playerLevel || 1,
        sessionLength: sessionLength || "3-4 hours",
        suggestedEncounters: [] as Array<{
          type: string;
          description: string;
          resources: string;
        }>,
        resourceRecommendations: resourceSuggestions,
        planningNotes: [] as string[],
      };

      // Add specific suggestions based on session type
      if (sessionType?.toLowerCase().includes("combat")) {
        sessionPlan.suggestedEncounters.push({
          type: "Combat",
          description: "Consider 2-3 combat encounters with varying difficulty",
          resources: "Search for monsters appropriate to player level",
        });
      } else if (sessionType?.toLowerCase().includes("social")) {
        sessionPlan.suggestedEncounters.push({
          type: "Social",
          description:
            "Focus on NPC interactions and role-playing opportunities",
          resources: "Look for NPC stat blocks and social encounter guidelines",
        });
      } else {
        sessionPlan.suggestedEncounters.push({
          type: "Balanced",
          description: "Mix of combat, social, and exploration encounters",
          resources: "Variety of monsters, NPCs, and location descriptions",
        });
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Session planning suggestions for ${sessionPlan.campaignName}: ${sessionPlan.suggestedEncounters.length} encounter types suggested with ${resourceSuggestions.length} relevant resources found.`,
        data: {
          sessionPlan,
          campaignContext: campaignData,
          resourceCount: resourceSuggestions.length,
        },
      };
    } catch (error) {
      console.error("Error planning campaign session:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to plan session: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const suggestCampaignResources = tool({
  description:
    "Suggest specific resources from the PDF library that would be helpful for a particular campaign or session",
  parameters: z.object({
    campaignType: z
      .string()
      .describe("Type of campaign (horror, adventure, political, etc.)"),
    playerLevel: z
      .number()
      .optional()
      .describe("Player level for appropriate resource suggestions"),
    specificNeeds: z
      .string()
      .optional()
      .describe("Specific needs or themes for the campaign"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({
    campaignType,
    playerLevel,
    specificNeeds,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] suggestCampaignResources received:", {
      campaignType,
      playerLevel,
      specificNeeds,
    });
    try {
      // Build search queries based on campaign type and needs
      const searchQueries = [
        campaignType,
        specificNeeds,
        playerLevel ? `level ${playerLevel}` : "",
      ].filter(Boolean);

      const searchQuery = searchQueries.join(" ");

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.SEARCH),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            query: searchQuery,
            limit: 5,
          }),
        }
      );

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to search for resources: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        results?: Array<{
          chunk: {
            file_key: string;
            chunk_text: string;
          };
          score: number;
        }>;
      };

      if (!result.results || result.results.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message: `No specific resources found for ${campaignType} campaigns. Consider uploading more ${campaignType}-themed materials to your library.`,
          data: { results: [], empty: true },
        };
      }

      // Group and categorize suggestions
      const suggestions = result.results.reduce((acc: any, item) => {
        const fileName = item.chunk.file_key.split("/").pop() || "Unknown PDF";
        const category = categorizeResource(fileName, item.chunk.chunk_text);

        if (!acc[category]) {
          acc[category] = [];
        }

        acc[category].push({
          fileName,
          relevance: item.score,
          excerpt: `${item.chunk.chunk_text.substring(0, 200)}...`,
          reason: explainRelevance(campaignType, item.chunk.chunk_text),
        });

        return acc;
      }, {});

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Found ${result.results.length} relevant resources for ${campaignType} campaigns across ${Object.keys(suggestions).length} categories.`,
        data: {
          suggestions,
          campaignType,
          playerLevel,
          specificNeeds,
          totalResults: result.results.length,
        },
      };
    } catch (error) {
      console.error("Error suggesting campaign resources:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to suggest resources: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Helper functions for resource categorization and explanation
function categorizeResource(fileName: string, content: string): string {
  const lowerFileName = fileName.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (lowerFileName.includes("monster") || lowerContent.includes("monster")) {
    return "Monsters & Enemies";
  }
  if (lowerFileName.includes("spell") || lowerContent.includes("spell")) {
    return "Spells & Magic";
  }
  if (
    lowerFileName.includes("adventure") ||
    lowerContent.includes("adventure")
  ) {
    return "Adventures & Modules";
  }
  if (lowerFileName.includes("world") || lowerContent.includes("world")) {
    return "World Building";
  }
  if (lowerFileName.includes("npc") || lowerContent.includes("npc")) {
    return "NPCs & Characters";
  }
  return "General Resources";
}

function explainRelevance(campaignType: string, content: string): string {
  const lowerContent = content.toLowerCase();
  const lowerType = campaignType.toLowerCase();

  if (
    lowerType.includes("horror") &&
    (lowerContent.includes("horror") || lowerContent.includes("fear"))
  ) {
    return "Contains horror-themed content perfect for creating atmospheric encounters";
  }
  if (
    lowerType.includes("political") &&
    (lowerContent.includes("noble") || lowerContent.includes("court"))
  ) {
    return "Includes political intrigue elements suitable for court-based campaigns";
  }
  if (
    lowerType.includes("adventure") &&
    (lowerContent.includes("quest") || lowerContent.includes("adventure"))
  ) {
    return "Provides adventure hooks and quest structures";
  }
  return "Relevant content that could enhance your campaign";
}

export const campaignTools = {
  listCampaigns,
  createCampaign,
  listCampaignResources,
  addResourceToCampaign,
  showCampaignDetails,
  deleteCampaign,
  deleteCampaigns,
  searchPdfLibrary,
  getPdfLibraryStats,
  planCampaignSession,
  suggestCampaignResources,
  ...campaignContextTools,
};

// Usage example (in a Worker):
// const tool = new CampaignTool(env.CampaignManager);
// await tool.getCampaign("my-campaign-id");
