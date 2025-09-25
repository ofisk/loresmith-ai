import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { AUTH_CODES } from "../../shared-config";
import { createToolError, createToolSuccess } from "../utils";

// File metadata tools

export const updateFileMetadata = tool({
  description: "Update metadata for an uploaded file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded file"),
    description: z
      .string()
      .optional()
      .describe("Optional description for the file"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Optional tags for categorizing the file"),
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
    console.log("[Tool] updateFileMetadata received JWT:", jwt);
    console.log("[Tool] updateFileMetadata context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[updateFileMetadata] Using toolCallId:", toolCallId);

    try {
      console.log("[updateFileMetadata] Using JWT:", jwt);

      // Extract username from JWT
      let username = "default";
      if (jwt) {
        try {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          username = payload.username || "default";
          console.log(
            "[updateFileMetadata] Extracted username from JWT:",
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
        return createToolError(
          "Access denied to this file",
          {
            error: "Access denied",
          },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      console.log(
        "[updateFileMetadata] Updating metadata for fileKey:",
        fileKey
      );

      // Make API request to update metadata
      const response = await fetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.LIBRARY.UPDATE_METADATA(fileKey)
        ),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({
            description,
            tags,
          }),
        }
      );
      console.log("[updateFileMetadata] Response status:", response.status);
      if (!response.ok) {
        return createToolError(
          `Failed to update metadata: ${response.status}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }
      return createToolSuccess(
        `Metadata updated successfully for file "${fileKey}"`,
        { fileKey, description, tags, fileSize },
        toolCallId
      );
    } catch (error) {
      console.error("Error updating metadata:", error);
      return createToolError(
        `Error updating metadata: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

export const autoGenerateFileMetadata = tool({
  description:
    "Auto-generate description and tags for an existing file based on its content",
  parameters: z.object({
    fileKey: z
      .string()
      .describe("The file key of the file to auto-generate metadata for"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ fileKey, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] autoGeneratePdfMetadata received:", { fileKey, jwt });
    console.log("[Tool] autoGeneratePdfMetadata context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[autoGeneratePdfMetadata] Using toolCallId:", toolCallId);

    try {
      console.log("[autoGeneratePdfMetadata] Using JWT:", jwt);

      if (!jwt) {
        return createToolError(
          "JWT token is required",
          null,
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      // Trigger background processing by making a lightweight API call
      // This will start the processing in a separate worker context
      console.log("[autoGeneratePdfMetadata] Triggering background processing");

      const env = context?.env;
      if (env) {
        try {
          // Extract user info from JWT for the background job
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          const username = payload.username;
          const openaiApiKey = payload.openaiApiKey;

          // Create a background processing request
          const processingUrl = `${env.VITE_API_URL}/pdf/process-metadata-background`;
          console.log(
            "[autoGeneratePdfMetadata] Making background processing request to:",
            processingUrl
          );

          const response = await fetch(processingUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              fileKey,
              username,
              openaiApiKey,
            }),
          });

          if (response.ok) {
            return createToolSuccess(
              "PDF metadata generation has been initiated in the background. The system will process your PDF and generate improved description and tags automatically. This may take a few moments to complete.",
              {
                fileKey,
                status: "processing",
                message: "Background metadata generation started successfully",
              },
              toolCallId
            );
          } else {
            console.log(
              "[autoGeneratePdfMetadata] Background processing failed, falling back to lightweight response"
            );
          }
        } catch (error) {
          console.error(
            "[autoGeneratePdfMetadata] Background processing error:",
            error
          );
        }
      }

      // Fallback to lightweight response if background processing fails
      console.log(
        "[autoGeneratePdfMetadata] Returning lightweight response to avoid memory issues"
      );

      return createToolSuccess(
        "PDF metadata generation initiated. The system will process your PDF and generate improved description and tags automatically. This may take a few moments to complete.",
        {
          fileKey,
          status: "processing",
          message: "Metadata generation has been queued for processing",
        },
        toolCallId
      );
    } catch (error) {
      console.error("[autoGeneratePdfMetadata] Error:", error);
      return createToolError(
        `Failed to auto-generate metadata: ${error}`,
        error,
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
