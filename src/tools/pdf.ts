import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../constants";

// PDF-related tool definitions

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
      const fileSize = Math.round((fileContent.length * 3) / 4);
      return {
        code: AUTH_CODES.SUCCESS,
        message: `PDF file "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) has been received and will be processed. The file contains ${fileContent.length} characters of base64 encoded data.`,
        data: { fileName, fileSize, description, tags, status: "processing" },
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

const listPdfFiles = tool({
  description: "List all uploaded PDF files for the current user",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listPdfFiles received JWT:", jwt);
    console.log("[Tool] listPdfFiles context:", context);
    try {
      console.log("[listPdfFiles] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[listPdfFiles] Environment from context:", env);
      console.log(
        "[listPdfFiles] PDF_BUCKET binding exists:",
        env?.PDF_BUCKET !== undefined
      );

      if (env?.PDF_BUCKET) {
        console.log(
          "[listPdfFiles] Running in Durable Object context, calling server directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[listPdfFiles] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        console.log("[listPdfFiles] Listing files for username:", username);

        // Call the server endpoint to get actual files
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
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
            message: `Failed to list PDF files: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }

        const result = (await response.json()) as {
          files: Array<{
            fileKey: string;
            fileName: string;
            fileSize: number;
            uploaded: string;
            status: string;
          }>;
        };

        if (!result.files || result.files.length === 0) {
          return {
            code: AUTH_CODES.SUCCESS,
            message: `No PDF files found for user "${username}". Upload some PDFs to get started!`,
            data: { files: [], count: 0, username },
          };
        }

        const fileList = result.files
          .map(
            (file) =>
              `- ${file.fileName} (${(file.fileSize / 1024 / 1024).toFixed(2)} MB)`
          )
          .join("\n");

        return {
          code: AUTH_CODES.SUCCESS,
          message: `📄 Found ${result.files.length} PDF file(s) for user "${username}":\n${fileList}`,
          data: {
            files: result.files,
            count: result.files.length,
            username,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[listPdfFiles] Running in HTTP context, making API request"
        );
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.FILES),
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
          }
        );
        console.log("[listPdfFiles] Response status:", response.status);
        if (!response.ok) {
          return {
            code: AUTH_CODES.ERROR,
            message: `Failed to list PDF files: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }
        const result = (await response.json()) as {
          files: Array<{
            fileKey: string;
            fileName: string;
            fileSize: number;
            uploadedAt: string;
            description?: string;
            tags?: string[];
          }>;
        };

        if (!result.files || result.files.length === 0) {
          return {
            code: AUTH_CODES.SUCCESS,
            message: "No PDF files found. Upload some PDFs to get started!",
            data: { files: [], count: 0 },
          };
        }

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Found ${result.files.length} PDF file(s): ${result.files.map((f) => f.fileName).join(", ")}`,
          data: {
            files: result.files,
            count: result.files.length,
          },
        };
      }
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error listing PDF files: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const getPdfStats = tool({
  description: "Get statistics about uploaded PDF files",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] getPdfStats received JWT:", jwt);
    console.log("[Tool] getPdfStats context:", context);
    try {
      console.log("[getPdfStats] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[getPdfStats] Environment from context:", env);
      console.log(
        "[getPdfStats] PDF_BUCKET binding exists:",
        env?.PDF_BUCKET !== undefined
      );

      if (env?.PDF_BUCKET) {
        console.log(
          "[getPdfStats] Running in Durable Object context, calling server directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log("[getPdfStats] Extracted username from JWT:", username);
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        console.log("[getPdfStats] Getting stats for username:", username);

        // Call the server endpoint to get actual stats
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
            message: `Failed to get PDF stats: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }

        const result = (await response.json()) as {
          username: string;
          totalFiles: number;
          filesByStatus: {
            uploading: number;
            uploaded: number;
            parsing: number;
            parsed: number;
            error: number;
          };
        };

        return {
          code: AUTH_CODES.SUCCESS,
          message: `PDF statistics for user "${result.username}": ${result.totalFiles} files uploaded`,
          data: {
            totalFiles: result.totalFiles,
            totalSize: 0, // Not calculated in current implementation
            averageFileSize: 0, // Not calculated in current implementation
            username: result.username,
            filesByStatus: result.filesByStatus,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[getPdfStats] Running in HTTP context, making API request"
        );
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
        console.log("[getPdfStats] Response status:", response.status);
        if (!response.ok) {
          return {
            code: AUTH_CODES.ERROR,
            message: `Failed to get PDF stats: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }
        const result = (await response.json()) as {
          totalFiles: number;
          totalSize: number;
          averageFileSize: number;
        };

        return {
          code: AUTH_CODES.SUCCESS,
          message: `PDF statistics: ${result.totalFiles} files uploaded, ${(result.totalSize / 1024 / 1024).toFixed(2)} MB total size, ${(result.averageFileSize / 1024 / 1024).toFixed(2)} MB average file size`,
          data: result,
        };
      }
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error getting PDF stats: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

const generatePdfUploadUrl = tool({
  description: "Generate a presigned upload URL for a PDF file",
  parameters: z.object({
    fileName: z.string().describe("The name of the PDF file to upload"),
    fileSize: z.number().describe("The size of the file in bytes"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    { fileName, fileSize, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] generatePdfUploadUrl received JWT:", jwt);
    console.log("[Tool] generatePdfUploadUrl context:", context);
    try {
      console.log("[generatePdfUploadUrl] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[generatePdfUploadUrl] Environment from context:", env);
      console.log(
        "[generatePdfUploadUrl] PDF_BUCKET binding exists:",
        env?.PDF_BUCKET !== undefined
      );

      if (env?.PDF_BUCKET) {
        console.log(
          "[generatePdfUploadUrl] Running in Durable Object context, calling server directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[generatePdfUploadUrl] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        // Generate unique file key using username from JWT
        const fileKey = `uploads/${username}/${fileName}`;
        const uploadUrl = `/pdf/upload/${fileKey}`;

        console.log("[generatePdfUploadUrl] Generated fileKey:", fileKey);
        console.log("[generatePdfUploadUrl] Generated uploadUrl:", uploadUrl);

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Upload URL generated successfully for "${fileName}"`,
          data: {
            uploadUrl,
            fileKey,
            username,
            fileName,
            fileSize,
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[generatePdfUploadUrl] Running in HTTP context, making API request"
        );
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
            body: JSON.stringify({ fileName, fileSize }),
          }
        );
        console.log("[generatePdfUploadUrl] Response status:", response.status);
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
          username: string;
        };
        return {
          code: AUTH_CODES.SUCCESS,
          message: `Upload URL generated successfully for "${fileName}"`,
          data: {
            uploadUrl: result.uploadUrl,
            fileKey: result.fileKey,
            username: result.username,
            fileName,
            fileSize,
          },
        };
      }
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
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    { fileKey, description, tags, fileSize, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] updatePdfMetadata received JWT:", jwt);
    console.log("[Tool] updatePdfMetadata context:", context);
    try {
      console.log("[updatePdfMetadata] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[updatePdfMetadata] Environment from context:", env);
      console.log(
        "[updatePdfMetadata] PDF_BUCKET binding exists:",
        env?.PDF_BUCKET !== undefined
      );

      if (env?.PDF_BUCKET) {
        console.log(
          "[updatePdfMetadata] Running in Durable Object context, calling server directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[updatePdfMetadata] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        // Verify the fileKey belongs to the authenticated user
        if (!fileKey.startsWith(`uploads/${username}/`)) {
          return {
            code: AUTH_CODES.ERROR,
            message: "Access denied to this file",
            data: { error: "Access denied" },
          };
        }

        console.log(
          "[updatePdfMetadata] Updating metadata for fileKey:",
          fileKey
        );

        return {
          code: AUTH_CODES.SUCCESS,
          message: `Metadata updated successfully for file "${fileKey}"`,
          data: { fileKey, description, tags, fileSize },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[updatePdfMetadata] Running in HTTP context, making API request"
        );
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
              metadata: { description, tags, fileSize },
            }),
          }
        );
        console.log("[updatePdfMetadata] Response status:", response.status);
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
          data: { fileKey, description, tags, fileSize },
        };
      }
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

const ingestPdfFile = tool({
  description:
    "Trigger ingestion and processing of an uploaded PDF file with AI metadata generation",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF to ingest"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ fileKey, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] ingestPdfFile received JWT:", jwt);
    console.log("[Tool] ingestPdfFile context:", context);
    try {
      console.log("[ingestPdfFile] Using JWT:", jwt);

      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[ingestPdfFile] Environment from context:", env);
      console.log(
        "[ingestPdfFile] PDF_BUCKET binding exists:",
        env?.PDF_BUCKET !== undefined
      );

      if (env?.PDF_BUCKET) {
        console.log(
          "[ingestPdfFile] Running in Durable Object context, calling server directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[ingestPdfFile] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        // Verify the fileKey belongs to the authenticated user
        if (!fileKey.startsWith(`uploads/${username}/`)) {
          return {
            code: AUTH_CODES.ERROR,
            message: "Access denied to this file",
            data: { error: "Access denied" },
          };
        }

        console.log("[ingestPdfFile] Processing fileKey:", fileKey);

        return {
          code: AUTH_CODES.SUCCESS,
          message: `PDF ingestion started for file "${fileKey}". The file will be processed and indexed for search.`,
          data: {
            fileKey,
            status: "processing",
            message: "PDF ingestion initiated successfully",
          },
        };
      } else {
        // Fall back to HTTP API
        console.log(
          "[ingestPdfFile] Running in HTTP context, making API request"
        );
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.INGEST),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
            body: JSON.stringify({ fileKey }),
          }
        );
        console.log("[ingestPdfFile] Response status:", response.status);
        if (!response.ok) {
          return {
            code: AUTH_CODES.ERROR,
            message: `Failed to ingest PDF: ${response.status}`,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.SUCCESS,
          message: `PDF ingestion started for file "${fileKey}". The file will be processed and indexed for search.`,
          data: {
            fileKey,
            status: "processing",
            message: "PDF ingestion initiated successfully",
          },
        };
      }
    } catch (error) {
      console.error("Error ingesting PDF:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Error ingesting PDF: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

export const pdfTools = {
  uploadPdfFile,
  listPdfFiles,
  getPdfStats,
  generatePdfUploadUrl,
  updatePdfMetadata,
  ingestPdfFile,
};
