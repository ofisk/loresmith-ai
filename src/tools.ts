/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */

import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import { tool } from "ai";
import { z } from "zod";
import {
  API_CONFIG,
  AUTH_CODES,
  type ToolResult,
  USER_MESSAGES,
} from "./constants";
import type { Chat } from "./server";

/**
 * Tool to set admin secret for PDF upload functionality
 * This validates the provided admin key and stores it in the session
 */
const setAdminSecret = tool({
  description: "Validate and store the admin key for PDF upload functionality",
  parameters: z.object({
    adminKey: z.string().describe("The admin key provided by the user"),
    username: z.string().describe("The username provided by the user"),
    openaiApiKey: z
      .string()
      .optional()
      .describe("Optional OpenAI API key provided by the user"),
  }),
  execute: async ({
    adminKey,
    username,
    openaiApiKey,
  }): Promise<ToolResult> => {
    try {
      // Make HTTP request to the authenticate endpoint using centralized API config
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.AUTH.AUTHENTICATE),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            providedKey: adminKey,
            username,
            ...(openaiApiKey && { openaiApiKey }),
          }),
        }
      );

      const result = (await response.json()) as {
        success: boolean;
        authenticated: boolean;
        error?: string;
        token?: string;
      };

      if (result.success && result.authenticated) {
        return {
          code: AUTH_CODES.SUCCESS,
          message: USER_MESSAGES.ADMIN_KEY_VALIDATED,
          data: { authenticated: true, token: result.token },
        };
      }
      return {
        code: AUTH_CODES.INVALID_KEY,
        message: USER_MESSAGES.INVALID_ADMIN_KEY,
        data: { authenticated: false },
      };
    } catch (error) {
      console.error("Error validating admin key:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error validating admin key: ${error}`,
        data: { authenticated: false },
      };
    }
  },
});

/**
 * Tool to upload a PDF file
 * This allows the agent to handle PDF file uploads with metadata
 */
const uploadPdfFile = tool({
  description: "Upload a PDF file with optional description and tags",
  parameters: z.object({
    fileName: z.string().describe("The name of the PDF file to upload"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the PDF file"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorizing the PDF file"),
    fileContent: z.string().describe("Base64 encoded content of the PDF file"),
  }),
  execute: async ({
    fileName,
    description,
    tags,
    fileContent,
  }): Promise<ToolResult> => {
    try {
      // For now, return a success message indicating the file was processed
      // In a full implementation, this would directly access the Durable Object
      // and handle the file upload to R2 storage

      const fileSize = Math.round((fileContent.length * 3) / 4); // Approximate base64 size

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.PDF_FILE_RECEIVED} "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)} MB). The file contains ${fileContent.length} characters of base64 encoded data.`,
        data: {
          fileName,
          fileSize,
          description,
          tags,
          status: "processing",
        },
      };
    } catch (error) {
      console.error("Error uploading PDF file:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error uploading PDF file: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

/**
 * Tool to list uploaded PDF files
 * This allows the agent to show the user what PDFs have been uploaded
 */
const listPdfFiles = tool({
  description:
    "List all PDF files that have been uploaded by the current user (JWT required)",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      // Make HTTP request to get files from server using centralized API config
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (jwt) {
        headers.Authorization = `Bearer ${jwt}`;
      }

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
        {
          method: "GET",
          headers,
        }
      );

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_RETRIEVE_FILES}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as { files: unknown[] };

      if (!result.files || result.files.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message: `📄 ${USER_MESSAGES.NO_PDF_FILES}`,
          data: { files: [] },
        };
      }

      const fileList = result.files
        .map((file: unknown) => {
          if (
            typeof file === "object" &&
            file !== null &&
            "fileName" in file &&
            "status" in file
          ) {
            // @ts-expect-error: file is unknown but we check properties
            return `- ${file.fileName} (${file.status})${file.metadata?.description ? ` - ${file.metadata.description}` : ""}`;
          }
          return "- Unknown file format";
        })
        .join("\n");

      return {
        code: AUTH_CODES.SUCCESS,
        message: `📄 ${USER_MESSAGES.PDF_FILES_LIST}\n${fileList}`,
        data: { files: result.files },
      };
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `❌ ${USER_MESSAGES.FAILED_TO_RETRIEVE_FILES}: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

/**
 * Tool to get PDF upload statistics
 * This allows the agent to show statistics about PDF uploads
 */
const getPdfStats = tool({
  description:
    "Get statistics about PDF uploads and processing for the authenticated user (JWT-based, not session-based; JWT required)",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }): Promise<ToolResult> => {
    try {
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.STATS),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_RETRIEVE_STATS}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      const result = (await response.json()) as {
        username: string;
        totalFiles: number;
        filesByStatus: Record<string, number>;
      };
      return {
        code: AUTH_CODES.SUCCESS,
        message: `📊 ${USER_MESSAGES.PDF_STATS_TITLE} ${result.username}\n- Total Files: ${result.totalFiles}\n- Files by Status: ${JSON.stringify(result.filesByStatus, null, 2)}`,
        data: result,
      };
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `❌ ${USER_MESSAGES.FAILED_TO_RETRIEVE_STATS}: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  parameters: unstable_scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  },
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  },
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  parameters: z.object({
    taskId: z.string().describe("The ID of the task to cancel"),
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  },
});

/**
 * Tool to generate a presigned upload URL for PDF files
 * This allows the UI to upload files directly to R2 storage without going through the agent
 */
const generatePdfUploadUrl = tool({
  description: "Generate a presigned upload URL for a PDF file",
  parameters: z.object({
    fileName: z.string().describe("The name of the PDF file to upload"),
    fileSize: z.number().describe("The size of the file in bytes"),
    jwt: z
      .string()
      .optional()
      .describe(
        "JWT token for authentication (optional, will use agent's JWT if not provided)"
      ),
  }),
  execute: async ({ fileName, fileSize, jwt }): Promise<ToolResult> => {
    try {
      console.log("Generating upload URL with JWT:", jwt);

      // Make HTTP request to get presigned URL from server using centralized API config
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            fileName,
            fileSize,
          }),
        }
      );

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_GENERATE_URL}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        uploadUrl: string;
        fileKey: string;
        username: string;
      };

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.UPLOAD_URL_GENERATED} "${fileName}"`,
        data: {
          uploadUrl: result.uploadUrl,
          fileKey: result.fileKey,
          username: result.username,
          fileName,
          fileSize,
        },
      };
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error generating upload URL: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

/**
 * Tool to update PDF file metadata after upload
 * This allows the agent to update file metadata like description and tags
 */
const updatePdfMetadata = tool({
  description: "Update metadata for an uploaded PDF file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the PDF file"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorizing the PDF file"),
    fileSize: z
      .number()
      .describe("The actual size of the uploaded file in bytes"),
    jwt: z
      .string()
      .optional()
      .describe(
        "JWT token for authentication (optional, will use agent's JWT if not provided)"
      ),
  }),
  execute: async ({
    fileKey,
    description,
    tags,
    fileSize,
    jwt,
  }): Promise<ToolResult> => {
    try {
      // Make HTTP request to update metadata
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPDATE_METADATA),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            fileKey,
            metadata: {
              description,
              tags,
              fileSize,
            },
          }),
        }
      );

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_UPDATE_METADATA}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.METADATA_UPDATED} "${fileKey}"`,
        data: {
          fileKey,
          description,
          tags,
          fileSize,
        },
      };
    } catch (error) {
      console.error("Error updating metadata:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error updating metadata: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

/**
 * Tool to trigger PDF ingestion after upload
 * This allows the agent to start processing the uploaded PDF
 */
const ingestPdfFile = tool({
  description: "Trigger ingestion and processing of an uploaded PDF file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF to ingest"),
    jwt: z
      .string()
      .optional()
      .describe(
        "JWT token for authentication (optional, will use agent's JWT if not provided)"
      ),
  }),
  execute: async ({ fileKey, jwt }): Promise<ToolResult> => {
    try {
      // Make HTTP request to trigger ingestion using centralized API config
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.INGEST),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            fileKey,
          }),
        }
      );

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_TRIGGER_INGESTION}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        success: boolean;
        fileKey: string;
        status: string;
      };

      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.PDF_INGESTION_STARTED} "${fileKey}". Status: ${result.status}`,
        data: {
          fileKey,
          status: result.status,
        },
      };
    } catch (error) {
      console.error("Error triggering ingestion:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error triggering ingestion: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

/**
 * Campaign management tools
 * These tools allow the AI to manage campaigns and their resources
 */
const createCampaign = tool({
  description: "Create a new campaign to organize resources and content",
  parameters: z.object({
    name: z.string().describe("The name of the campaign to create"),
  }),
  // No execute function - requires UI confirmation
});

const listCampaignResources = tool({
  description: "List all resources in a specific campaign",
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
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE}/${campaignId}`
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
        message: `${USER_MESSAGES.CAMPAIGN_RESOURCES_FOUND} ${campaignId}: ${result.campaign.resources.length} resource(s)`,
        data: { resources: result.campaign.resources },
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
  description: "Add a resource to a campaign",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to add the resource to"),
    resourceType: z
      .enum(["pdf", "character", "note", "image"])
      .describe("The type of resource to add"),
    resourceId: z.string().describe("The ID or URL of the resource"),
    resourceName: z
      .string()
      .optional()
      .describe("Optional friendly name for the resource"),
  }),
  // No execute function - requires UI confirmation
});

const showCampaignDetails = tool({
  description:
    "Show detailed information about a campaign including metadata and resource statistics",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to show details for"),
  }),
  // No execute function - requires UI confirmation
});

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
    console.log("[Tool] listCampaigns tool called!");
    try {
      console.log("[listCampaigns] Using JWT:", jwt);
      console.log("Listing campaigns");

      const url = API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE);
      console.log("[listCampaigns] Making request to:", url);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
      });
      console.log("[listCampaigns] Response status:", response.status);
      if (!response.ok) {
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

const deleteCampaign = tool({
  description: "Delete a campaign by its ID",
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
      const response = await fetch(
        API_CONFIG.buildUrl(
          `${API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE}/${campaignId}`
        ),
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );
      console.log("[deleteCampaign] Response status:", response.status);
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `${USER_MESSAGES.FAILED_TO_DELETE_CAMPAIGN}: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      return {
        code: AUTH_CODES.SUCCESS,
        message: `${USER_MESSAGES.CAMPAIGN_DELETED} ${campaignId}`,
        data: { campaignId },
      };
    } catch (error) {
      return {
        code: AUTH_CODES.ERROR,
        message: `Error deleting campaign: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const deleteCampaigns = tool({
  description: "Delete multiple campaigns by their IDs",
  parameters: z.object({
    campaignIds: z
      .array(z.string())
      .describe("The IDs of the campaigns to delete"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignIds, jwt }): Promise<ToolResult> => {
    console.log("[Tool] deleteCampaigns received JWT:", jwt);
    const results = [];
    for (const campaignId of campaignIds) {
      try {
        console.log("[deleteCampaigns] Deleting campaign:", campaignId);
        const response = await fetch(
          API_CONFIG.buildUrl(
            `${API_CONFIG.ENDPOINTS.CAMPAIGNS.BASE}/${campaignId}`
          ),
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
          }
        );
        console.log(
          "[deleteCampaigns] Response status for",
          campaignId,
          ":",
          response.status
        );
        if (!response.ok) {
          results.push({
            campaignId,
            success: false,
            error: `HTTP ${response.status}`,
          });
        } else {
          results.push({ campaignId, success: true });
        }
      } catch (error) {
        results.push({
          campaignId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const failed = results.filter((r) => !r.success);
    if (failed.length === 0) {
      return {
        code: AUTH_CODES.SUCCESS,
        message: USER_MESSAGES.ALL_CAMPAIGNS_DELETED,
        data: { results },
      };
    }
    return {
      code: AUTH_CODES.ERROR,
      message: `${USER_MESSAGES.SOME_CAMPAIGNS_NOT_DELETED} ${failed.map((f) => f.campaignId).join(", ")}`,
      data: { results },
    };
  },
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  setAdminSecret,
  uploadPdfFile,
  listPdfFiles,
  getPdfStats,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  generatePdfUploadUrl,
  updatePdfMetadata,
  ingestPdfFile,
  createCampaign,
  listCampaigns,
  listCampaignResources,
  addResourceToCampaign,
  showCampaignDetails,
  deleteCampaign,
  deleteCampaigns,
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 * NOTE: keys below should match toolsRequiringConfirmation in app.tsx
 */
export const executions = {
  // ... existing code ...
};
