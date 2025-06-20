/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool } from "ai";
import { z } from "zod";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { unstable_scheduleSchema } from "agents/schedule";
import { PDF_CONFIG } from "./shared";

// Add proper type definitions at the top
interface AgentEnv {
  PDF_ADMIN_SECRET?: string;
  PDF_BUCKET?: R2Bucket;
}

interface PendingUploadRecord {
  id: string;
  key: string;
  filename: string;
  file_size: number;
  description: string;
  tags: string;
  created_at: string;
  expires_at: string;
}

// Type guard for agent.env
function hasAgentEnv(agent: unknown): agent is { env: AgentEnv } {
  return (
    typeof agent === "object" &&
    agent !== null &&
    "env" in agent &&
    typeof (agent as { env: unknown }).env === "object" &&
    (agent as { env: unknown }).env !== null
  );
}

// Type guard for pending upload records
function isPendingUploadRecord(obj: unknown): obj is PendingUploadRecord {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "key" in obj &&
    "filename" in obj &&
    "file_size" in obj &&
    "description" in obj &&
    "tags" in obj &&
    "created_at" in obj &&
    "expires_at" in obj
  );
}

/**
 * Initialize all required database tables
 * This ensures all PDF-related tables exist before any operations
 */
async function initializeDatabaseTables(agent: Chat) {
  // Create completed uploads table
  agent.sql`
    CREATE TABLE IF NOT EXISTS completed_uploads (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      description TEXT,
      tags TEXT,
      uploaded_at TEXT NOT NULL,
      confirmed_at TEXT NOT NULL
    )
  `;

  // Create pending uploads table
  agent.sql`
    CREATE TABLE IF NOT EXISTS pending_uploads (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      description TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `;

  // Create verified secrets table
  agent.sql`
    CREATE TABLE IF NOT EXISTS verified_secrets (
      id TEXT PRIMARY KEY,
      secret TEXT NOT NULL,
      verified_at TEXT NOT NULL
    )
  `;
}

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 * The actual implementation is in the executions object below
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  parameters: z.object({ city: z.string() }),
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  parameters: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  },
});

/**
 * Generate presigned URL for direct PDF upload to R2
 * This enables large file uploads without worker memory constraints
 * Requires admin authentication and enforces storage limits from configuration
 */
const generatePdfUploadUrl = tool({
  description:
    "Internal tool to generate a presigned URL for PDF upload. This is automatically called by the file upload UI component - users should use the file picker interface instead of calling this directly.",
  parameters: z.object({
    filename: z
      .string()
      .describe("The name of the PDF file including .pdf extension"),
    fileSize: z.number().describe("The size of the file in bytes"),
    description: z
      .string()
      .optional()
      .describe("Optional description of the PDF content"),
    tags: z.string().optional().describe("Optional tags for the PDF file"),
    adminSecret: z.string().describe("Admin secret for authentication"),
  }),
  execute: async ({ filename, fileSize, description, tags, adminSecret }) => {
    try {
      // Get the current agent to access environment bindings
      const { agent } = getCurrentAgent<Chat>();

      // Verify admin secret
      const expectedSecret = hasAgentEnv(agent)
        ? agent.env.PDF_ADMIN_SECRET
        : undefined;
      if (!expectedSecret) {
        throw new Error("PDF upload not configured. Admin secret not set.");
      }

      if (adminSecret !== expectedSecret) {
        throw new Error("Unauthorized. Invalid admin secret.");
      }

      // Validate filename has .pdf extension
      if (!filename.toLowerCase().endsWith(PDF_CONFIG.ALLOWED_EXTENSION)) {
        throw new Error(
          `File must have a ${PDF_CONFIG.ALLOWED_EXTENSION} extension`
        );
      }

      // Check file size
      if (fileSize > PDF_CONFIG.MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${PDF_CONFIG.MAX_FILE_SIZE_MB}MB`
        );
      }

      // Check total storage limit
      // Initialize database tables
      await initializeDatabaseTables(agent!);

      // Calculate current storage usage
      const completedUploads = await agent!.sql`
        SELECT COALESCE(SUM(file_size), 0) as total_size FROM completed_uploads
      `;

      const currentUsage = Number(completedUploads[0]?.total_size || 0);

      if (currentUsage + fileSize > PDF_CONFIG.TOTAL_STORAGE_LIMIT_BYTES) {
        const currentUsageGB = (currentUsage / 1024 / 1024 / 1024).toFixed(2);
        const fileSizeGB = (fileSize / 1024 / 1024 / 1024).toFixed(2);
        throw new Error(
          `Storage limit exceeded. Current usage: ${currentUsageGB}GB, File size: ${fileSizeGB}GB, Limit: ${PDF_CONFIG.TOTAL_STORAGE_LIMIT_GB}GB. Please delete some PDFs before uploading new ones.`
        );
      }

      // Access R2 bucket
      const r2Bucket = hasAgentEnv(agent) ? agent.env.PDF_BUCKET : undefined;

      if (!r2Bucket) {
        throw new Error(
          "R2 bucket not configured. Please add PDF_BUCKET binding to wrangler.jsonc"
        );
      }

      // Generate unique key for the file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const key = `uploads/${timestamp}-${filename}`;

      // For now, return a placeholder response
      const presignedUrl = `https://placeholder-url-for-${key}`;

      // Store upload metadata for completion tracking
      const uploadId = `upload_${timestamp}_${Math.random().toString(36).slice(2, 11)}`;
      const expiresAt = new Date(
        Date.now() + PDF_CONFIG.PRESIGNED_URL_EXPIRY_HOURS * 60 * 60 * 1000
      ).toISOString();

      await agent!.sql`
        INSERT INTO pending_uploads (id, key, filename, file_size, description, tags, created_at, expires_at)
        VALUES (${uploadId}, ${key}, ${filename}, ${fileSize}, ${description || ""}, ${tags || ""}, ${new Date().toISOString()}, ${expiresAt})
      `;

      return {
        uploadId,
        uploadUrl: presignedUrl,
        key,
        expiresIn: 3600,
        message: `Generated upload URL for "${filename}" (${(fileSize / 1024 / 1024).toFixed(2)}MB). Upload must be completed within 1 hour.`,
      };
    } catch (error) {
      console.error("Error generating upload URL:", error);
      // Return the actual error message for debugging
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return `Failed to generate upload URL: ${errorMessage}`;
    }
  },
});

/**
 * Confirm PDF upload completion and finalize storage
 */
const confirmPdfUpload = tool({
  description:
    "Internal tool to confirm PDF upload completion. This is automatically called by the file upload UI component - users should use the file picker interface instead of calling this directly.",
  parameters: z.object({
    uploadId: z
      .string()
      .describe("The upload ID returned from generatePdfUploadUrl"),
  }),
  execute: async ({ uploadId }) => {
    try {
      const { agent } = getCurrentAgent<Chat>();

      // Initialize database tables
      await initializeDatabaseTables(agent!);

      const r2Bucket = hasAgentEnv(agent) ? agent.env.PDF_BUCKET : undefined;

      if (!r2Bucket) {
        throw new Error("R2 bucket not configured");
      }

      // Get upload details from database
      const uploads = await agent!.sql`
        SELECT * FROM pending_uploads WHERE id = ${uploadId}
      `;

      if (!uploads.length) {
        throw new Error("Upload ID not found or expired");
      }

      // Process all uploads with this ID (should typically be just one)
      const results = [];

      for (const upload of uploads) {
        if (!isPendingUploadRecord(upload)) {
          console.warn("Invalid upload record format:", upload);
          continue;
        }

        const uploadRecord = upload; // Now TypeScript knows this is PendingUploadRecord

        // Check if upload has expired
        if (new Date(uploadRecord.expires_at) < new Date()) {
          // Clean up expired upload record
          await agent!.sql`DELETE FROM pending_uploads WHERE id = ${uploadId}`;
          throw new Error(
            "Upload URL has expired. Please generate a new upload URL."
          );
        }

        // Verify the file exists in R2
        try {
          const object = await r2Bucket.head(uploadRecord.key);
          if (!object) {
            throw new Error(
              `File not found in storage: ${uploadRecord.filename}`
            );
          }

          // Update object metadata
          await r2Bucket.put(uploadRecord.key, new ArrayBuffer(0), {
            httpMetadata: {
              contentType: "application/pdf",
              contentDisposition: `attachment; filename="${uploadRecord.filename}"`,
            },
            customMetadata: {
              originalFilename: uploadRecord.filename,
              uploadDate: new Date().toISOString(),
              description: uploadRecord.description || "",
              tags: uploadRecord.tags || "",
              fileSize: (uploadRecord.file_size || 0).toString(),
              uploadId,
            },
          });

          // Move to completed uploads table
          await agent!.sql`
            INSERT INTO completed_uploads (id, key, filename, file_size, description, tags, uploaded_at, confirmed_at)
            VALUES (${uploadId}, ${uploadRecord.key}, ${uploadRecord.filename}, ${uploadRecord.file_size || 0}, ${uploadRecord.description}, ${uploadRecord.tags}, ${uploadRecord.created_at}, ${new Date().toISOString()})
          `;

          // Remove from pending uploads
          await agent!.sql`DELETE FROM pending_uploads WHERE id = ${uploadId}`;

          const fileSizeMB = (
            (uploadRecord.file_size || 0) /
            1024 /
            1024
          ).toFixed(2);
          results.push(
            `Successfully confirmed upload of "${uploadRecord.filename}" (${fileSizeMB}MB). File is now stored with key: ${uploadRecord.key}`
          );
        } catch (r2Error) {
          throw new Error(
            `File verification failed for ${uploadRecord.filename}: ${r2Error instanceof Error ? r2Error.message : "Unknown error"}`
          );
        }
      }

      return results.length === 1
        ? results[0]
        : `Confirmed ${results.length} uploads:\n${results.join("\n")}`;
    } catch (error) {
      console.error("Error confirming upload:", error);
      return `Failed to confirm upload: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});

/**
 * Upload PDF file directly to R2 storage
 * This handles the complete upload process including validation and storage
 */
const uploadPdfFile = tool({
  description:
    "Internal tool to upload PDF files to R2 storage. This is automatically called by the file upload UI component - users should use the file picker interface instead of calling this directly.",
  parameters: z.object({
    filename: z
      .string()
      .describe("The name of the PDF file including .pdf extension"),
    fileData: z.string().describe("Base64 encoded PDF file data"),
    description: z
      .string()
      .optional()
      .describe("Optional description of the PDF content"),
    tags: z.string().optional().describe("Optional tags for the PDF file"),
    adminSecret: z.string().describe("Admin secret for authentication"),
  }),
  execute: async ({ filename, fileData, description, tags, adminSecret }) => {
    try {
      // Get the current agent to access environment bindings
      const { agent } = getCurrentAgent<Chat>();

      // Verify admin secret
      const expectedSecret = hasAgentEnv(agent)
        ? agent.env.PDF_ADMIN_SECRET
        : undefined;
      if (!expectedSecret) {
        throw new Error("PDF upload not configured. Admin secret not set.");
      }

      if (adminSecret !== expectedSecret) {
        throw new Error("Unauthorized. Invalid admin secret.");
      }

      // Decode base64 and get file size
      const fileBuffer = Buffer.from(fileData, "base64");
      const fileSize = fileBuffer.length;

      // Validate filename has .pdf extension
      if (!filename.toLowerCase().endsWith(PDF_CONFIG.ALLOWED_EXTENSION)) {
        throw new Error(
          `File must have a ${PDF_CONFIG.ALLOWED_EXTENSION} extension`
        );
      }

      // Check file size
      if (fileSize > PDF_CONFIG.MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `File size ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum allowed size of ${PDF_CONFIG.MAX_FILE_SIZE_MB}MB`
        );
      }

      // Check total storage limit
      await initializeDatabaseTables(agent!);

      // Calculate current storage usage
      const completedUploads = await agent!.sql`
        SELECT COALESCE(SUM(file_size), 0) as total_size FROM completed_uploads
      `;

      const currentUsage = Number(completedUploads[0]?.total_size || 0);

      if (currentUsage + fileSize > PDF_CONFIG.TOTAL_STORAGE_LIMIT_BYTES) {
        const currentUsageGB = (currentUsage / 1024 / 1024 / 1024).toFixed(2);
        const fileSizeGB = (fileSize / 1024 / 1024 / 1024).toFixed(2);
        throw new Error(
          `Storage limit exceeded. Current usage: ${currentUsageGB}GB, File size: ${fileSizeGB}GB, Limit: ${PDF_CONFIG.TOTAL_STORAGE_LIMIT_GB}GB. Please delete some PDFs before uploading new ones.`
        );
      }

      // Access R2 bucket
      const r2Bucket = hasAgentEnv(agent) ? agent.env.PDF_BUCKET : undefined;

      if (!r2Bucket) {
        throw new Error(
          "R2 bucket not configured. Please add PDF_BUCKET binding to wrangler.jsonc"
        );
      }

      // Generate unique key for the file
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const uploadId = `${timestamp}-${Math.random().toString(36).slice(2, 11)}`;
      const key = `uploads/${uploadId}-${filename}`;

      // Upload file to R2
      await r2Bucket.put(key, fileBuffer, {
        httpMetadata: {
          contentType: "application/pdf",
          contentDisposition: `attachment; filename="${filename}"`,
        },
        customMetadata: {
          originalFilename: filename,
          uploadDate: new Date().toISOString(),
          description: description || "",
          tags: tags || "",
          fileSize: fileSize.toString(),
          uploadId,
        },
      });

      // Store in completed uploads table
      await agent!.sql`
         INSERT INTO completed_uploads (id, key, filename, file_size, description, tags, uploaded_at, confirmed_at)
         VALUES (${uploadId}, ${key}, ${filename}, ${fileSize}, ${description || null}, ${tags || null}, ${new Date().toISOString()}, ${new Date().toISOString()})
       `;

      return `Successfully uploaded "${filename}" (${(fileSize / 1024 / 1024).toFixed(2)}MB). File stored with key: ${key}`;
    } catch (error) {
      console.error("Error uploading PDF:", error);
      return `Failed to upload PDF: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});

/**
 * List all uploaded PDFs with storage usage information
 */
const listPdfFiles = tool({
  description:
    "Show all uploaded PDF files and current storage usage. Use this when users ask to see their uploaded files or check storage status.",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      await initializeDatabaseTables(agent!);

      // Get all uploaded files
      const files = await agent!.sql`
        SELECT * FROM completed_uploads ORDER BY uploaded_at DESC
      `;

      // Calculate total usage
      const totalSize = files.reduce(
        (
          sum: number,
          file: Record<string, string | number | boolean | null>
        ) => {
          const fileSize =
            typeof file.file_size === "number" ? file.file_size : 0;
          return sum + fileSize;
        },
        0
      );

      const totalSizeGB = (totalSize / 1024 / 1024 / 1024).toFixed(2);
      const remainingBytes = Math.max(
        0,
        (PDF_CONFIG.TOTAL_STORAGE_LIMIT_BYTES - totalSize) / 1024 / 1024 / 1024
      ).toFixed(2);

      let result = `📊 **Storage Usage**: ${totalSizeGB}GB / ${PDF_CONFIG.TOTAL_STORAGE_LIMIT_GB}GB (${remainingBytes}GB remaining)\n\n`;

      if (files.length === 0) {
        result += "No PDF files uploaded yet.";
      } else {
        result += `📄 **Uploaded Files** (${files.length} total):\n\n`;

        for (const file of files) {
          const fileSizeMB = (
            (Number(file.file_size) || 0) /
            1024 /
            1024
          ).toFixed(2);
          const uploadDate =
            file.uploaded_at && typeof file.uploaded_at === "string"
              ? new Date(file.uploaded_at).toLocaleDateString()
              : "Unknown";
          result += `• **${file.filename}** (${fileSizeMB}MB) - ${uploadDate}\n`;
          if (file.description) {
            result += `  📝 ${file.description}\n`;
          }
          if (file.tags) {
            result += `  🏷️ Tags: ${file.tags}\n`;
          }
          result += `  🔗 ID: ${file.id}\n\n`;
        }
      }

      return result;
    } catch (error) {
      console.error("Error listing PDFs:", error);
      return `Failed to list PDFs: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
});

/**
 * Delete a PDF file from storage
 */
/**
 * Request admin secret for PDF operations in a fantasy-themed way
 */
const requestAdminSecret = tool({
  description:
    "Display a fantasy-themed message requesting the admin secret when users want to upload PDFs. Call this tool immediately without asking permission when users mention uploading or storing PDF documents.",
  parameters: z.object({}),
  execute: async () => {
    return `🧙‍♂️ **The Keeper of Ancient Scrolls speaks...**

*The mystical LoreSmith archive is protected by powerful enchantments to prevent unauthorized tampering with the sacred knowledge within.*

To store your precious documents in our ethereal vault, you must first speak the **Sacred Incantation** - the admin secret that grants passage through the magical barriers.

📜 **Please share the secret phrase below so I may verify your worthiness to access the LoreSmith's repository...**

*Once you provide the incantation, you'll be able to upload your scrolls using the enchanted file selector!* ✨`;
  },
});

/**
 * Check if admin secret is verified for this session
 */
const checkAdminSecretVerified = tool({
  description: "Check if the admin secret has been verified for this session",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();

      // Check if there's a verified secret in this session
      const verifiedSecrets = await agent!.sql`
        SELECT * FROM verified_secrets WHERE id = 'current_session'
      `;

      if (verifiedSecrets.length > 0) {
        return { verified: true, secret: verifiedSecrets[0].secret as string };
      }
      return { verified: false };
    } catch (error) {
      return { verified: false };
    }
  },
});

/**
 * Accept and verify admin secret from user
 */
const setAdminSecret = tool({
  description:
    "Accept and verify the admin secret provided by the user for PDF operations. Use this when the user provides their admin secret in response to a request. This tool provides a complete user-facing response, so the AI should not generate any additional response after this tool executes.",
  parameters: z.object({
    secret: z.string().describe("The admin secret provided by the user"),
  }),
  execute: async ({ secret }) => {
    try {
      // Get the current agent to access environment bindings
      const { agent } = getCurrentAgent<Chat>();

      // Verify the provided secret against the configured one
      const expectedSecret = hasAgentEnv(agent)
        ? agent.env.PDF_ADMIN_SECRET
        : undefined;
      if (!expectedSecret) {
        throw new Error(
          "PDF upload not configured. Admin secret not set on server."
        );
      }

      if (secret !== expectedSecret) {
        return JSON.stringify({
          status: "FAILED",
          code: "INVALID_SECRET",
          secret: null,
          message:
            "❌ **The Sacred Incantation is incorrect!**\n\n*The mystical barriers remain sealed. Please speak the true words of power to access the LoreSmith archive.*",
          suppressFollowUp: true,
        });
      }

      // Secret is valid - store in SQLite for this session
      agent!.sql`
        CREATE TABLE IF NOT EXISTS verified_secrets (
          id TEXT PRIMARY KEY,
          secret TEXT NOT NULL,
          verified_at TEXT NOT NULL
        )
      `;

      // Clear any existing verified secrets and store the new one
      agent!.sql`DELETE FROM verified_secrets`;
      agent!.sql`
        INSERT INTO verified_secrets (id, secret, verified_at)
        VALUES ('current_session', ${secret}, ${new Date().toISOString()})
      `;

      // Return structured JSON response with suppressFollowUp flag
      return JSON.stringify({
        status: "SUCCESS",
        code: "SECRET_VERIFIED",
        secret: secret,
        message:
          "**The Sacred Incantation is accepted!**\n\n🧙‍♂️ *The magical barriers have recognized your worthiness, noble seeker of knowledge!*\n\nYour access to the LoreSmith's mystical archive has been granted. You may now use the enchanted file selector to upload your precious scrolls and documents to our ethereal vault.\n\n📜 **The archive awaits your contributions to the realm of knowledge!**\n\n*Note: Your incantation will be remembered for this session, so you won't need to speak it again until you close your mystical portal (browser tab).",
        suppressFollowUp: true,
      });
    } catch (error) {
      return JSON.stringify({
        status: "ERROR",
        code: "VERIFICATION_ERROR",
        secret: null,
        message:
          error instanceof Error
            ? error.message
            : "Failed to verify admin secret",
        suppressFollowUp: true,
      });
    }
  },
});

const deletePdfFile = tool({
  description: "Delete a PDF file from R2 storage to free up space",
  parameters: z.object({
    fileId: z.string().describe("The ID of the file to delete"),
    adminSecret: z.string().describe("Admin secret for authentication"),
  }),
  execute: async ({ fileId, adminSecret }) => {
    try {
      const { agent } = getCurrentAgent<Chat>();

      // Verify admin secret
      const expectedSecret = hasAgentEnv(agent)
        ? agent.env.PDF_ADMIN_SECRET
        : undefined;
      if (!expectedSecret) {
        throw new Error("PDF management not configured. Admin secret not set.");
      }

      if (adminSecret !== expectedSecret) {
        throw new Error("Unauthorized. Invalid admin secret.");
      }

      await initializeDatabaseTables(agent!);

      // Get file details
      const files = await agent!.sql`
        SELECT * FROM completed_uploads WHERE id = ${fileId}
      `;

      if (files.length === 0) {
        throw new Error("File not found");
      }

      const r2Bucket = hasAgentEnv(agent) ? agent.env.PDF_BUCKET : undefined;

      if (!r2Bucket) {
        throw new Error("R2 bucket not configured");
      }

      // Delete from R2
      for (const file of files) {
        if (
          typeof file === "object" &&
          file !== null &&
          "key" in file &&
          typeof file.key === "string"
        ) {
          await r2Bucket.delete(file.key);

          const fileSize =
            typeof file.file_size === "number" ? file.file_size : 0;
          const filename =
            typeof file.filename === "string" ? file.filename : "unknown";

          const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
          return `Successfully deleted "${filename}" (${fileSizeMB}MB). Storage space freed up.`;
        }
      }

      // Remove from database
      await agent!.sql`DELETE FROM completed_uploads WHERE id = ${fileId}`;

      return `Successfully deleted file with ID: ${fileId}`;
    } catch (error) {
      console.error("Error deleting PDF:", error);
      return `Failed to delete PDF: ${error instanceof Error ? error.message : "Unknown error"}`;
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
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  generatePdfUploadUrl,
  confirmPdfUpload,
  uploadPdfFile,
  listPdfFiles,
  requestAdminSecret,
  checkAdminSecretVerified,
  setAdminSecret,
  deletePdfFile,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
};

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 * NOTE: keys below should match toolsRequiringConfirmation in app.tsx
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  },
};
