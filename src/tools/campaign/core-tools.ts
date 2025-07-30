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

// Core campaign operations

export const listCampaigns = tool({
  description: "List all campaigns for the current user",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listCampaigns received JWT:", jwt);

    try {
      const env = getEnvironment(context);
      const isDO = isDurableObjectContext(context);

      if (isDO && env?.CampaignManager) {
        console.log("[listCampaigns] Running in Durable Object context");

        const username = extractUsernameFromJwt(jwt);
        console.log("[listCampaigns] Extracted username:", username);

        // Get CampaignManager Durable Object
        const campaignManager = env.CampaignManager;
        console.log(
          "[listCampaigns] CampaignManager binding:",
          campaignManager
        );
        const campaignManagerId = campaignManager.idFromName(username);
        console.log(
          "[listCampaigns] CampaignManager ID:",
          campaignManagerId.toString()
        );
        const campaignManagerStub = campaignManager.get(campaignManagerId);
        console.log(
          "[listCampaigns] CampaignManager stub:",
          campaignManagerStub
        );

        // Call CampaignManager directly
        const response = await campaignManagerStub.fetch(
          "https://dummy-host/campaigns",
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );
        console.log(
          "[listCampaigns] CampaignManager response status:",
          response.status
        );
        console.log(
          "[listCampaigns] CampaignManager response ok:",
          response.ok
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            "[listCampaigns] CampaignManager error response:",
            errorText
          );
          return createToolError(
            `Failed to list campaigns: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const data = (await response.json()) as { campaigns?: any[] };
        console.log("[listCampaigns] CampaignManager data:", data);

        if (data.campaigns && data.campaigns.length > 0) {
          return createToolSuccess(USER_MESSAGES.RESOURCES_FOUND, {
            campaigns: data.campaigns,
            empty: false,
          });
        } else {
          return createToolSuccess(USER_MESSAGES.NO_RESOURCES, {
            campaigns: [],
            empty: true,
          });
        }
      } else {
        // Fall back to HTTP API
        console.log(
          "[listCampaigns] Running in HTTP context, making API request"
        );
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
            return createToolError(authError, {
              error: `HTTP ${response.status}`,
            });
          }
          return createToolError(
            `Failed to list campaigns: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const data = (await response.json()) as { campaigns?: any[] };
        console.log("[listCampaigns] API response data:", data);

        if (data.campaigns && data.campaigns.length > 0) {
          return createToolSuccess(USER_MESSAGES.RESOURCES_FOUND, {
            campaigns: data.campaigns,
            empty: false,
          });
        } else {
          return createToolSuccess(USER_MESSAGES.NO_RESOURCES, {
            campaigns: [],
            empty: true,
          });
        }
      }
    } catch (error) {
      console.error("Error listing campaigns:", error);
      return createToolError(
        `Failed to list campaigns: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const createCampaign = tool({
  description: "Create a new campaign",
  parameters: z.object({
    name: z.string().describe("The name of the campaign to create"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ name, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] createCampaign received:", { name, jwt });

    try {
      const env = getEnvironment(context);
      const isDO = isDurableObjectContext(context);

      if (isDO && env?.CampaignManager) {
        console.log("[createCampaign] Running in Durable Object context");

        const username = extractUsernameFromJwt(jwt);
        console.log("[createCampaign] Extracted username:", username);

        // Get CampaignManager Durable Object
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

        // Call CampaignManager directly
        const response = await campaignManagerStub.fetch(
          "https://dummy-host/campaigns",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          }
        );
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
          return createToolError(
            `Failed to create campaign: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const data = (await response.json()) as { campaignId: string };
        console.log("[createCampaign] CampaignManager data:", data);

        return createToolSuccess(
          `The campaign "${name}" has been created successfully! Campaign ID: ${data.campaignId} Created At: ${new Date().toLocaleDateString()}`,
          {
            campaignId: data.campaignId,
            name,
            createdAt: new Date().toISOString(),
          }
        );
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

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(authError, {
              error: `HTTP ${response.status}`,
            });
          }
          return createToolError(
            `Failed to create campaign: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const data = (await response.json()) as { campaignId: string };
        console.log("[createCampaign] API response data:", data);

        return createToolSuccess(
          `The campaign "${name}" has been created successfully! Campaign ID: ${data.campaignId} Created At: ${new Date().toLocaleDateString()}`,
          {
            campaignId: data.campaignId,
            name,
            createdAt: new Date().toISOString(),
          }
        );
      }
    } catch (error) {
      console.error("Error creating campaign:", error);
      return createToolError(
        `Failed to create campaign: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
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

    try {
      const env = getEnvironment(context);
      const isDO = isDurableObjectContext(context);

      if (isDO && env?.CampaignManager) {
        console.log("[showCampaignDetails] Running in Durable Object context");

        const username = extractUsernameFromJwt(jwt);
        console.log("[showCampaignDetails] Extracted username:", username);

        // Get CampaignManager Durable Object
        const campaignManager = env.CampaignManager;
        console.log(
          "[showCampaignDetails] CampaignManager binding:",
          campaignManager
        );
        const campaignManagerId = campaignManager.idFromName(username);
        console.log(
          "[showCampaignDetails] CampaignManager ID:",
          campaignManagerId.toString()
        );
        const campaignManagerStub = campaignManager.get(campaignManagerId);
        console.log(
          "[showCampaignDetails] CampaignManager stub:",
          campaignManagerStub
        );

        // Call CampaignManager directly
        const response = await campaignManagerStub.fetch(
          `https://dummy-host/campaigns/${campaignId}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );
        console.log(
          "[showCampaignDetails] CampaignManager response status:",
          response.status
        );
        console.log(
          "[showCampaignDetails] CampaignManager response ok:",
          response.ok
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            "[showCampaignDetails] CampaignManager error response:",
            errorText
          );
          return createToolError(
            `Failed to get campaign details: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const data = (await response.json()) as {
          name: string;
          campaignId: string;
          createdAt: string;
          resources?: any[];
          status?: string;
        };
        console.log("[showCampaignDetails] CampaignManager data:", data);

        return createToolSuccess(
          `Campaign Details for "${data.name}":\n\nID: ${data.campaignId}\nName: ${data.name}\nCreated: ${new Date(data.createdAt).toLocaleDateString()}\nResources: ${data.resources?.length || 0} files\nStatus: ${data.status || "Active"}`,
          {
            campaign: data,
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[showCampaignDetails] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)
          ),
          {
            method: "GET",
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
            `Failed to get campaign details: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const data = (await response.json()) as {
          name: string;
          campaignId: string;
          createdAt: string;
          resources?: any[];
          status?: string;
        };
        console.log("[showCampaignDetails] API response data:", data);

        return createToolSuccess(
          `Campaign Details for "${data.name}":\n\nID: ${data.campaignId}\nName: ${data.name}\nCreated: ${new Date(data.createdAt).toLocaleDateString()}\nResources: ${data.resources?.length || 0} files\nStatus: ${data.status || "Active"}`,
          {
            campaign: data,
          }
        );
      }
    } catch (error) {
      console.error("Error getting campaign details:", error);
      return createToolError(
        `Failed to get campaign details: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
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

    try {
      const env = getEnvironment(context);
      const isDO = isDurableObjectContext(context);

      if (isDO && env?.CampaignManager) {
        console.log("[deleteCampaign] Running in Durable Object context");

        const username = extractUsernameFromJwt(jwt);
        console.log("[deleteCampaign] Extracted username:", username);

        // Get CampaignManager Durable Object
        const campaignManager = env.CampaignManager;
        console.log(
          "[deleteCampaign] CampaignManager binding:",
          campaignManager
        );
        const campaignManagerId = campaignManager.idFromName(username);
        console.log(
          "[deleteCampaign] CampaignManager ID:",
          campaignManagerId.toString()
        );
        const campaignManagerStub = campaignManager.get(campaignManagerId);
        console.log(
          "[deleteCampaign] CampaignManager stub:",
          campaignManagerStub
        );

        // Call CampaignManager directly
        const response = await campaignManagerStub.fetch(
          `https://dummy-host/campaigns/${campaignId}`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
          }
        );
        console.log(
          "[deleteCampaign] CampaignManager response status:",
          response.status
        );
        console.log(
          "[deleteCampaign] CampaignManager response ok:",
          response.ok
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.log(
            "[deleteCampaign] CampaignManager error response:",
            errorText
          );
          return createToolError(
            `Failed to delete campaign: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        console.log("[deleteCampaign] Campaign deleted successfully");

        return createToolSuccess(
          `Campaign ${campaignId} has been deleted successfully.`,
          {
            campaignId,
            deleted: true,
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[deleteCampaign] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.DETAILS(campaignId)
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
            `Failed to delete campaign: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        console.log("[deleteCampaign] Campaign deleted successfully");

        return createToolSuccess(
          `Campaign ${campaignId} has been deleted successfully.`,
          {
            campaignId,
            deleted: true,
          }
        );
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      return createToolError(
        `Failed to delete campaign: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const deleteCampaigns = tool({
  description:
    "Delete multiple campaigns by their IDs (user-specific - only deletes campaigns owned by the authenticated user)",
  parameters: z.object({
    campaignIds: z
      .array(z.string())
      .describe("Array of campaign IDs to delete"),
    jwt: commonSchemas.jwt,
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
        return createToolError(authError, { error: `HTTP ${authStatusCode}` });
      }

      // If any campaigns are inaccessible, return an error
      if (inaccessibleCampaigns.length > 0) {
        return createToolError(
          `Cannot delete campaigns: ${inaccessibleCampaigns.join(", ")}. These campaigns either don't exist or you don't have permission to access them.`,
          {
            error: "Campaigns not accessible",
            inaccessibleCampaigns,
            accessibleCampaigns,
          }
        );
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
          return createToolError(authError, {
            error: `HTTP ${deleteResponse.status}`,
          });
        }
        return createToolError(
          `${USER_MESSAGES.FAILED_TO_DELETE_CAMPAIGNS}: ${deleteResponse.status}`,
          { error: `HTTP ${deleteResponse.status}` }
        );
      }

      return createToolSuccess(
        `${USER_MESSAGES.CAMPAIGNS_DELETED} ${campaignIds.join(", ")}`,
        { campaignIds }
      );
    } catch (error) {
      console.error("Error deleting campaigns:", error);
      return createToolError(
        `Error deleting campaigns: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
