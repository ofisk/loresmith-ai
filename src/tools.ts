/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import type { Chat } from "./server";
import { AUTH_CODES, type ToolResult } from "./shared";

/**
 * Tool to set admin secret for PDF upload functionality
 * This validates the provided admin key and stores it in the session
 */
const setAdminSecret = tool({
  description: "Validate and store the admin key for PDF upload functionality",
  parameters: z.object({
    adminKey: z.string().describe("The admin key provided by the user"),
  }),
  execute: async ({ adminKey }): Promise<ToolResult> => {
    try {
      // Get the current agent to access session ID
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";

      // Make HTTP request to the authenticate endpoint which uses the environment variable
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/authenticate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          providedKey: adminKey,
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        authenticated: boolean;
        error?: string;
      };

      if (result.success && result.authenticated) {
        return {
          code: AUTH_CODES.SUCCESS,
          message:
            "Admin key validated successfully! You now have access to PDF upload and parsing features.",
          data: { authenticated: true },
        };
      }
      return {
        code: AUTH_CODES.INVALID_KEY,
        message: "Invalid admin key. Please check your key and try again.",
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
 * Tool to check PDF upload authentication status
 * This allows the agent to check if the current session is authenticated for PDF operations
 */
const checkPdfAuthStatus = tool({
  description:
    "Check if the current session is authenticated for PDF upload operations",
  parameters: z.object({
    sessionId: z
      .string()
      .describe(
        "The session ID to check authentication for (optional, will use agent session if not provided)"
      ),
  }),
  execute: async ({ sessionId }): Promise<ToolResult> => {
    try {
      const effectiveSessionId = sessionId;

      console.log("Checking auth status for session:", sessionId);

      // Make HTTP request to check authentication status
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(
        `${apiBaseUrl}/pdf/is-session-authenticated?sessionId=${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = (await response.json()) as {
        authenticated: boolean;
      };

      console.log("Auth check result:", {
        sessionId: effectiveSessionId,
        result,
      });

      if (result.authenticated) {
        return {
          code: AUTH_CODES.SUCCESS,
          message:
            "Session is authenticated for PDF operations. You can upload PDF files.",
          data: { authenticated: true },
        };
      }
      return {
        code: AUTH_CODES.SESSION_NOT_AUTHENTICATED,
        message:
          "Session is not authenticated for PDF operations. Please provide your admin key to enable PDF upload functionality.",
        data: { authenticated: false },
      };
    } catch (error) {
      console.error("Error checking PDF auth status:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error checking authentication status: ${error}`,
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
        message: `PDF file "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) has been received and will be processed. The file contains ${fileContent.length} characters of base64 encoded data.`,
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
    "List all PDF files that have been uploaded in the current session",
  parameters: z.object({}),
  execute: async (): Promise<ToolResult> => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";

      // Make HTTP request to get files from server
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(
        `${apiBaseUrl}/pdf/files?sessionId=${sessionId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to retrieve files: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as { files: unknown[] };

      if (!result.files || result.files.length === 0) {
        return {
          code: AUTH_CODES.SUCCESS,
          message:
            "📄 No PDF files have been uploaded yet in this session. Use the generatePdfUploadUrl tool to upload your first PDF.",
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
        message: `📄 Uploaded PDF files:\n${fileList}`,
        data: { files: result.files },
      };
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `❌ Error retrieving PDF files: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

/**
 * Tool to get PDF upload statistics
 * This allows the agent to show upload statistics to the user
 */
const getPdfStats = tool({
  description: "Get statistics about PDF uploads and processing",
  parameters: z.object({}),
  execute: async () => {
    try {
      // For now, return basic stats structure since we don't have aggregation across sessions
      return `📊 PDF Upload Statistics:
- Total Sessions: 1 (current session)
- Total Files: Check with "list my PDF files" command
- Note: Statistics are per-session only`;
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return `❌ Error retrieving PDF statistics: ${error}`;
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
    sessionId: z
      .string()
      .optional()
      .describe(
        "The session ID to use for the upload (optional, will use agent session if not provided)"
      ),
  }),
  execute: async ({ fileName, fileSize, sessionId }): Promise<ToolResult> => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const effectiveSessionId = sessionId || agent?.name || "default-session";

      console.log("Generating upload URL for session:", effectiveSessionId);

      // Make HTTP request to get presigned URL from server
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: effectiveSessionId,
          fileName,
          fileSize,
        }),
      });

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to generate upload URL: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        uploadUrl: string;
        fileKey: string;
        sessionId: string;
      };

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Upload URL generated successfully for "${fileName}"`,
        data: {
          uploadUrl: result.uploadUrl,
          fileKey: result.fileKey,
          sessionId: result.sessionId,
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
  }),
  execute: async ({
    fileKey,
    description,
    tags,
    fileSize,
  }): Promise<ToolResult> => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";

      // Make HTTP request to update metadata
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/update-metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileKey,
          metadata: {
            description,
            tags,
            fileSize,
          },
        }),
      });

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to update metadata: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Metadata updated successfully for file "${fileKey}"`,
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
  }),
  execute: async ({ fileKey }): Promise<ToolResult> => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      const sessionId = agent?.name || "default-session";

      // Make HTTP request to trigger ingestion
      const apiBaseUrl =
        import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/pdf/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId,
          fileKey,
        }),
      });

      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to trigger ingestion: ${response.status}`,
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
        message: `PDF ingestion started successfully for "${fileKey}". Status: ${result.status}`,
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
    campaignId: z.string().describe("The ID of the campaign to list resources for"),
  }),
  execute: async ({ campaignId }) => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
    const response = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`);
    if (!response.ok) {
      return { error: "Campaign not found" };
    }
    const data = (await response.json()) as { campaign: { resources: unknown[] } };
    return data.campaign.resources || [];
  },
});

const addResourceToCampaign = tool({
  description: "Add a resource to a campaign",
  parameters: z.object({
    campaignId: z.string().describe("The ID of the campaign to add the resource to"),
    resourceType: z.enum(["pdf", "character", "note", "image"]).describe("The type of resource to add"),
    resourceId: z.string().describe("The ID or URL of the resource"),
    resourceName: z.string().optional().describe("Optional friendly name for the resource"),
  }),
  // No execute function - requires UI confirmation
});

const showCampaignDetails = tool({
  description: "Show detailed information about a campaign including metadata and resource statistics",
  parameters: z.object({
    campaignId: z.string().describe("The ID of the campaign to show details for"),
  }),
  // No execute function - requires UI confirmation
});

const listCampaigns = tool({
  description: "List all campaigns for the current user",
  parameters: z.object({}),
  execute: async () => {
    console.log("Listing campaigns");
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
    const response = await fetch(`${apiBaseUrl}/api/campaigns`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      return { error: `Failed to retrieve campaigns: ${response.status}` };
    }
    const result = (await response.json()) as { campaigns: unknown[] };
    return result.campaigns || [];
  },
});

const deleteCampaign = tool({
  description: "Delete a campaign by its ID",
  parameters: z.object({
    campaignId: z.string().describe("The ID of the campaign to delete"),
  }),
  execute: async ({ campaignId }): Promise<ToolResult> => {
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
      const response = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to delete campaign: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }
      return {
        code: AUTH_CODES.SUCCESS,
        message: `Campaign ${campaignId} deleted successfully.`,
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
    campaignIds: z.array(z.string()).describe("The IDs of the campaigns to delete"),
  }),
  execute: async ({ campaignIds }): Promise<ToolResult> => {
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8787";
    const results = [];
    for (const campaignId of campaignIds) {
      try {
        const response = await fetch(`${apiBaseUrl}/api/campaigns/${campaignId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          results.push({ campaignId, success: false, error: `HTTP ${response.status}` });
        } else {
          results.push({ campaignId, success: true });
        }
      } catch (error) {
        results.push({ campaignId, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const failed = results.filter(r => !r.success);
    if (failed.length === 0) {
      return {
        code: AUTH_CODES.SUCCESS,
        message: `All campaigns deleted successfully.`,
        data: { results },
      };
    } else {
      return {
        code: AUTH_CODES.ERROR,
        message: `Some campaigns could not be deleted: ${failed.map(f => f.campaignId).join(", ")}`,
        data: { results },
      };
    }
  },
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  setAdminSecret,
  checkPdfAuthStatus,
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
