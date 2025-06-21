/**
 * PDF Tools Module
 * 
 * This module contains all PDF-related tools for AI-driven operations.
 * These tools are designed for AI-initiated uploads and operations.
 * For user-initiated uploads from the UI, the application uses direct API endpoints
 * for better performance and reliability.
 *
 * Architecture:
 * - UI uploads → Direct APIs (/api/upload-pdf-direct, /api/generate-upload-url, etc.)
 * - AI operations → Agent tools (generatePdfUploadUrl, uploadPdfFile, confirmPdfUpload)
 *
 * Benefits of agent tools for AI operations:
 * - Context awareness and intelligent decision making
 * - Integration with other AI capabilities and workflows
 * - Ability to process and analyze uploaded content
 * - Complex operations combining multiple tools
 */

import { tool } from "ai";
import { z } from "zod";
import type { Chat } from "../server";
import { getCurrentAgent } from "agents";
import { PDF_CONFIG } from "../shared";

// Type definitions for PDF operations
interface AgentEnv {
  // Optional properties (alphabetical)
  ADMIN_SECRET?: string;
  PDF_BUCKET?: R2Bucket;
}

interface PendingUploadRecord {
  created_at: string;
  description: string;
  expires_at: string;
  file_size: number;
  filename: string;
  id: string;
  key: string;
  tags: string;
}

// Type guards
function hasAgentEnv(agent: unknown): agent is { env: AgentEnv } {
  return (
    typeof agent === "object" &&
    agent !== null &&
    "env" in agent &&
    typeof (agent as { env: unknown }).env === "object" &&
    (agent as { env: unknown }).env !== null
  );
}

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
 * Generate presigned URL for direct PDF upload to R2
 * This enables large file uploads without worker memory constraints
 * Requires admin authentication and enforces storage limits from configuration
 */
export const generatePdfUploadUrl = tool({
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
        ? agent.env.ADMIN_SECRET
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
      const completedUploads = agent!.sql`
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

      // Store upload metadata for completion tracking
      const uploadId = `upload_${timestamp}_${Math.random().toString(36).slice(2, 11)}`;
      const expiresAt = new Date(
        Date.now() + PDF_CONFIG.PRESIGNED_URL_EXPIRY_HOURS * 60 * 60 * 1000
      ).toISOString();

      // For now, create a direct upload endpoint URL
      // This will be handled by a separate upload endpoint in the worker
      const uploadUrl = `/api/upload-pdf?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}`;

      agent!.sql`
        INSERT INTO pending_uploads (id, key, filename, file_size, description, tags, created_at, expires_at)
        VALUES (${uploadId}, ${key}, ${filename}, ${fileSize}, ${description || ""}, ${tags || ""}, ${new Date().toISOString()}, ${expiresAt})
      `;

      return {
        uploadId,
        uploadUrl: uploadUrl,
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
export const confirmPdfUpload = tool({
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
      const uploads = agent!.sql`
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
          agent!.sql`DELETE FROM pending_uploads WHERE id = ${uploadId}`;
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
          agent!.sql`
            INSERT INTO completed_uploads (id, key, filename, file_size, description, tags, uploaded_at, confirmed_at)
            VALUES (${uploadId}, ${uploadRecord.key}, ${uploadRecord.filename}, ${uploadRecord.file_size || 0}, ${uploadRecord.description}, ${uploadRecord.tags}, ${uploadRecord.created_at}, ${new Date().toISOString()})
          `;

          // Remove from pending uploads
          agent!.sql`DELETE FROM pending_uploads WHERE id = ${uploadId}`;

          results.push(
            `Successfully confirmed upload of "${uploadRecord.filename}" (${(uploadRecord.file_size || 0 / 1024 / 1024).toFixed(2)}MB)`
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
export const uploadPdfFile = tool({
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
        ? agent.env.ADMIN_SECRET
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
      const completedUploads = agent!.sql`
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
      agent!.sql`
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
export const listPdfFiles = tool({
  description:
    "Show all uploaded PDF files and current storage usage. Use this when users ask to see their uploaded files or check storage status.",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      await initializeDatabaseTables(agent!);

      // Get all uploaded files
      const files = agent!.sql`
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
 * Delete a PDF file from R2 storage to free up space
 */
export const deletePdfFile = tool({
  description: "Delete a PDF file from R2 storage to free up space",
  parameters: z.object({
    fileId: z.string().describe("The ID of the file to delete"),
    adminSecret: z.string().describe("Admin secret for authentication"),
  }),
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Request admin secret for PDF operations
 */
export const requestAdminSecret = tool({
  description:
    "Request the admin secret for PDF operations. This is used internally by the system.",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      await initializeDatabaseTables(agent!);

      const expectedSecret = hasAgentEnv(agent)
        ? agent.env.ADMIN_SECRET
        : undefined;

      if (!expectedSecret) {
        return JSON.stringify({
          status: "ERROR",
          code: "NOT_CONFIGURED",
          message:
            "PDF upload functionality is not configured. Please set the ADMIN_SECRET environment variable.",
          suppressFollowUp: true,
        });
      }

      return JSON.stringify({
        status: "SUCCESS",
        code: "SECRET_REQUESTED",
        message:
          "**🧙‍♂️ The Sacred Incantation is Required!**\n\nTo access the mystical archive of LoreSmith, you must speak the sacred incantation (admin secret) that grants passage to the ethereal vault.\n\n*Please provide the admin secret to proceed with PDF operations.*",
        suppressFollowUp: true,
      });
    } catch (error) {
      return JSON.stringify({
        status: "ERROR",
        code: "REQUEST_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to request admin secret",
        suppressFollowUp: true,
      });
    }
  },
});

/**
 * Check if admin secret is verified for current session
 */
export const checkAdminSecretVerified = tool({
  description:
    "Check if the admin secret has been verified for the current session. This is used internally by the system.",
  parameters: z.object({}),
  execute: async () => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      await initializeDatabaseTables(agent!);

      const verifiedSecrets = agent!.sql`
        SELECT * FROM verified_secrets WHERE id = 'current_session'
      `;

      if (verifiedSecrets.length === 0) {
        return JSON.stringify({
          status: "ERROR",
          code: "NOT_VERIFIED",
          message:
            "Admin secret not verified. Please use the setAdminSecret tool to verify your access.",
          suppressFollowUp: true,
        });
      }

      return JSON.stringify({
        status: "SUCCESS",
        code: "VERIFIED",
        message: "Admin secret is verified for this session.",
        suppressFollowUp: true,
      });
    } catch (error) {
      return JSON.stringify({
        status: "ERROR",
        code: "CHECK_ERROR",
        message:
          error instanceof Error ? error.message : "Failed to check admin secret status",
        suppressFollowUp: true,
      });
    }
  },
});

/**
 * Set and verify admin secret for PDF operations
 */
export const setAdminSecret = tool({
  description:
    "Set and verify the admin secret for PDF operations. This is used internally by the system.",
  parameters: z.object({
    secret: z.string().describe("The admin secret to verify"),
  }),
  execute: async ({ secret }) => {
    try {
      const { agent } = getCurrentAgent<Chat>();
      await initializeDatabaseTables(agent!);

      const expectedSecret = hasAgentEnv(agent)
        ? agent.env.ADMIN_SECRET
        : undefined;

      if (!expectedSecret) {
        throw new Error("PDF upload not configured. Admin secret not set.");
      }

      if (secret !== expectedSecret) {
        throw new Error("Invalid admin secret.");
      }

      // Store verified secret in database
      agent!.sql`
        INSERT OR REPLACE INTO verified_secrets (id, secret, verified_at)
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

// Export all PDF tools as a group
export const pdfTools = {
  generatePdfUploadUrl,
  confirmPdfUpload,
  uploadPdfFile,
  listPdfFiles,
  deletePdfFile,
  requestAdminSecret,
  checkAdminSecretVerified,
  setAdminSecret,
}; 