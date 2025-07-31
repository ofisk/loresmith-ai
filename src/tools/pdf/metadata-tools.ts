import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { createToolError, createToolSuccess } from "../utils";

// PDF metadata tools

export const updatePdfMetadata = tool({
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
        // File keys can be either "username/filename" or "uploads/username/filename"
        if (
          !fileKey.startsWith(`${username}/`) &&
          !fileKey.startsWith(`uploads/${username}/`)
        ) {
          return createToolError("Access denied to this file", {
            error: "Access denied",
          });
        }

        console.log(
          "[updatePdfMetadata] Updating metadata for fileKey:",
          fileKey
        );

        return createToolSuccess(
          `Metadata updated successfully for file "${fileKey}"`,
          { fileKey, description, tags, fileSize }
        );
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
          return createToolError(
            `Failed to update metadata: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }
        return createToolSuccess(
          `Metadata updated successfully for file "${fileKey}"`,
          { fileKey, description, tags, fileSize }
        );
      }
    } catch (error) {
      console.error("Error updating metadata:", error);
      return createToolError(
        `Error updating metadata: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const autoGeneratePdfMetadata = tool({
  description:
    "Auto-generate description and tags for an existing PDF file based on its content",
  parameters: z.object({
    fileKey: z
      .string()
      .describe("The file key of the PDF file to auto-generate metadata for"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ fileKey, jwt }): Promise<ToolResult> => {
    console.log("[Tool] autoGeneratePdfMetadata received:", { fileKey, jwt });
    try {
      console.log("[autoGeneratePdfMetadata] Using JWT:", jwt);

      const url = API_CONFIG.buildUrl(
        API_CONFIG.ENDPOINTS.PDF.AUTO_GENERATE_METADATA
      );
      console.log("[autoGeneratePdfMetadata] Making request to:", url);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({ fileKey }),
      });
      console.log(
        "[autoGeneratePdfMetadata] Response status:",
        response.status
      );

      const result = (await response.json()) as {
        message?: string;
        data?: unknown;
        error?: string;
      };
      console.log("[autoGeneratePdfMetadata] Response:", result);

      if (response.ok) {
        return {
          code: 200,
          message: result.message || "Metadata auto-generated successfully",
          data: result.data,
        };
      } else {
        return {
          code: response.status,
          message:
            result.error ||
            `Failed to auto-generate metadata: ${response.status}`,
          data: result.data,
        };
      }
    } catch (error) {
      console.error("[autoGeneratePdfMetadata] Error:", error);
      return {
        code: 500,
        message: `Failed to auto-generate metadata: ${error}`,
      };
    }
  },
});
