import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { createToolError, createToolSuccess } from "../utils";

// PDF listing tools

export const listPdfFiles = tool({
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
          return createToolError(
            `Failed to list PDF files: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
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
          return createToolSuccess(
            `No PDF files found for user "${username}". Upload some PDFs to get started!`,
            { files: [], count: 0, username }
          );
        }

        const fileList = result.files
          .map(
            (file) =>
              `- ${file.fileName} (${(file.fileSize / 1024 / 1024).toFixed(2)} MB)`
          )
          .join("\n");

        return createToolSuccess(
          `📄 Found ${result.files.length} PDF file(s) for user "${username}":\n${fileList}`,
          {
            files: result.files,
            count: result.files.length,
            username,
          }
        );
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
          return createToolError(
            `Failed to list PDF files: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
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
          return createToolSuccess(
            "No PDF files found. Upload some PDFs to get started!",
            { files: [], count: 0 }
          );
        }

        return createToolSuccess(
          `Found ${result.files.length} PDF file(s): ${result.files.map((f) => f.fileName).join(", ")}`,
          {
            files: result.files,
            count: result.files.length,
          }
        );
      }
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return createToolError(
        `Error listing PDF files: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const getPdfStats = tool({
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
          return createToolError(
            `Failed to get PDF stats: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
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

        return createToolSuccess(
          `PDF statistics for user "${result.username}": ${result.totalFiles} files uploaded`,
          {
            totalFiles: result.totalFiles,
            totalSize: 0, // Not calculated in current implementation
            averageFileSize: 0, // Not calculated in current implementation
            username: result.username,
            filesByStatus: result.filesByStatus,
          }
        );
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
          return createToolError(
            `Failed to get PDF stats: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }
        const result = (await response.json()) as {
          totalFiles: number;
          totalSize: number;
          averageFileSize: number;
        };

        return createToolSuccess(
          `PDF statistics: ${result.totalFiles} files uploaded, ${(result.totalSize / 1024 / 1024).toFixed(2)} MB total size, ${(result.averageFileSize / 1024 / 1024).toFixed(2)} MB average file size`,
          result
        );
      }
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return createToolError(
        `Error getting PDF stats: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
