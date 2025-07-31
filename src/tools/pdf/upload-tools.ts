import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { createToolError, createToolSuccess } from "../utils";

// PDF upload tools

export const generatePdfUploadUrl = tool({
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

        return createToolSuccess(
          `Upload URL generated successfully for "${fileName}"`,
          {
            uploadUrl,
            fileKey,
            username,
            fileName,
            fileSize,
          }
        );
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
          return createToolError(
            `Failed to generate upload URL: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }
        const result = (await response.json()) as {
          uploadUrl: string;
          fileKey: string;
          username: string;
        };
        return createToolSuccess(
          `Upload URL generated successfully for "${fileName}"`,
          {
            uploadUrl: result.uploadUrl,
            fileKey: result.fileKey,
            username: result.username,
            fileName,
            fileSize,
          }
        );
      }
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return createToolError(
        `Error generating upload URL: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const uploadPdfFile = tool({
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
      return createToolSuccess(
        `PDF file "${fileName}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) has been received and will be processed. The file contains ${fileContent.length} characters of base64 encoded data.`,
        { fileName, fileSize, description, tags, status: "processing" }
      );
    } catch (error) {
      console.error("Error uploading PDF file:", error);
      return createToolError(
        `Error uploading PDF file: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const ingestPdfFile = tool({
  description: "Process and ingest a PDF file for AI analysis and search",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the PDF file to ingest"),
    filename: z.string().describe("The filename of the PDF file to ingest"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ fileKey, filename, jwt }): Promise<ToolResult> => {
    console.log("[Tool] ingestPdfFile received:", { fileKey, filename, jwt });
    try {
      console.log("[ingestPdfFile] Using JWT:", jwt);

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.INGEST),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ fileKey, filename }),
        }
      );

      console.log("[ingestPdfFile] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[ingestPdfFile] Error response:", errorText);
        return createToolError(
          `Failed to ingest PDF file: ${response.status} - ${errorText}`,
          { error: `HTTP ${response.status}` }
        );
      }

      const result = (await response.json()) as {
        chunks?: number;
        processingTime?: string;
      };
      console.log("[ingestPdfFile] Success response:", result);

      return createToolSuccess(
        `PDF file "${filename}" has been successfully ingested and is now available for AI analysis and search.`,
        {
          fileKey,
          filename,
          status: "ingested",
          chunks: result.chunks || 0,
          processingTime: result.processingTime || "unknown",
        }
      );
    } catch (error) {
      console.error("Error ingesting PDF file:", error);
      return createToolError(
        `Failed to ingest PDF file: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
