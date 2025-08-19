import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";

// Helper function to get environment from context
function getEnvFromContext(context: any): any {
  if (context?.env) {
    return context.env;
  }
  if (typeof globalThis !== "undefined" && "env" in globalThis) {
    return (globalThis as any).env;
  }
  return null;
}

// Tool to generate file upload URL
export const generateFileUploadUrl = tool({
  description: "Generate a secure upload URL for uploading files to the system",
  parameters: z.object({
    fileName: z.string().describe("The name of the file to upload"),
    fileSize: z.number().describe("The size of the file in bytes"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { fileName, fileSize, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[generatePdfUploadUrl] Using toolCallId:", toolCallId);

    console.log("[Tool] generatePdfUploadUrl received:", {
      fileName,
      fileSize,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] generatePdfUploadUrl - Environment found:", !!env);
      console.log("[Tool] generatePdfUploadUrl - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] generatePdfUploadUrl - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        // Generate upload URL using the new multipart upload system
        const response = await fetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_START),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${jwt}`,
            },
            body: JSON.stringify({
              filename: fileName,
              contentType: "application/pdf",
              fileSize: fileSize,
            }),
          }
        );

        if (!response.ok) {
          return createToolError(
            "Failed to generate upload URL",
            `HTTP ${response.status}: ${await response.text()}`,
            500,
            toolCallId
          );
        }

        const result = (await response.json()) as any;
        const uploadUrl = API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_START
        );
        const fileKey = result.fileKey;

        console.log("[Tool] Generated upload URL:", uploadUrl);

        return createToolSuccess(
          `Upload URL generated successfully for ${fileName}`,
          {
            uploadUrl,
            fileKey,
            fileName,
            fileSize,
            expiresIn: "1 hour",
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_START),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            fileName,
            fileSize,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to generate upload URL",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Upload URL generated successfully for ${fileName}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error generating upload URL:", error);
      return createToolError(
        "Failed to generate upload URL",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Tool to complete file upload
export const completeFileUpload = tool({
  description: "Complete the file upload process and process the uploaded file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded file"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ fileKey, jwt }, context?: any): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[completePdfUpload] Using toolCallId:", toolCallId);

    console.log("[Tool] completePdfUpload received:", {
      fileKey,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] completePdfUpload - Environment found:", !!env);
      console.log("[Tool] completePdfUpload - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] completePdfUpload - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        // Simulate file processing
        const fileName = fileKey.split("/").pop() || "unknown.pdf";
        const now = new Date().toISOString();

        console.log("[Tool] Completed PDF upload:", fileKey);

        return createToolSuccess(
          `PDF upload completed successfully: ${fileName}`,
          {
            fileKey,
            fileName,
            status: "uploaded",
            processedAt: now,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.UPLOAD_COMPLETE),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            fileKey,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to complete PDF upload",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `PDF upload completed successfully: ${(result as any).fileName || "Unknown"}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error completing PDF upload:", error);
      return createToolError(
        "Failed to complete PDF upload",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Shared function for PDF processing tools
async function processPdfTool(
  fileKey: string,
  jwt: string,
  operation: "ingest" | "retry",
  metadata?: {
    filename?: string;
    description?: string;
    tags?: string[];
  },
  context?: any
): Promise<ToolResult> {
  const toolCallId = context?.toolCallId || "unknown";
  const action = operation;

  console.log(`[Client] ${action}ing PDF processing for:`, fileKey);

  try {
    // Make HTTP request to process PDF
    const response = await authenticatedFetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.PROCESS_FILE),
      {
        method: "POST",
        jwt,
        body: JSON.stringify({
          fileKey,
          operation,
          ...metadata,
        }),
      }
    );

    if (!response.ok) {
      const authError = await handleAuthError(response);
      if (authError) {
        return createToolError(authError, null, 401, toolCallId);
      }
      return createToolError(
        `Failed to ${action} PDF processing`,
        `HTTP ${response.status}: ${await response.text()}`,
        500,
        toolCallId
      );
    }

    const result = await response.json();
    return createToolSuccess(
      `PDF ${action}ed successfully for: ${fileKey}`,
      result,
      toolCallId
    );
  } catch (error) {
    console.error(`Error ${action}ing PDF processing:`, error);
    return createToolError(
      `Failed to ${action} PDF processing`,
      error,
      500,
      toolCallId
    );
  }
}

export const processFile = tool({
  description:
    "Process a file for text extraction and content processing. Can be used for initial ingestion or retrying failed processing.",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the file to process"),
    jwt: commonSchemas.jwt,
    operation: z
      .enum(["ingest", "retry"])
      .describe(
        "Whether to ingest a new file or retry processing a failed file"
      ),
    filename: z
      .string()
      .optional()
      .describe("Filename (required for ingest operations)"),
    description: z.string().optional().describe("Description of the file"),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tags for categorizing the file"),
  }),
  execute: async (
    { fileKey, jwt, operation, filename, description, tags },
    context?: any
  ): Promise<ToolResult> => {
    if (!jwt) {
      return createToolError(
        "JWT token is required",
        "Authentication failed",
        401,
        context?.toolCallId || "unknown"
      );
    }

    // Validate required parameters
    if (operation === "ingest" && !filename) {
      return createToolError(
        "Filename is required for ingest operations",
        "Please provide a filename when ingesting a new file",
        400,
        context?.toolCallId || "unknown"
      );
    }

    const metadata = {
      filename,
      description,
      tags,
    };

    return processPdfTool(fileKey, jwt, operation, metadata, context);
  },
});
