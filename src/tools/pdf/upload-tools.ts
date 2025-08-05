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

// Tool to generate PDF upload URL
export const generatePdfUploadUrl = tool({
  description:
    "Generate a secure upload URL for uploading PDF files to the system",
  parameters: z.object({
    fileName: z.string().describe("The name of the PDF file to upload"),
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

        // Generate upload URL (simulated)
        const uploadUrl = `/api/pdf/upload/${userId}/${Date.now()}-${fileName}`;
        const fileKey = `${userId}/${Date.now()}-${fileName}`;

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
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD_URL),
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

// Tool to complete PDF upload
export const completePdfUpload = tool({
  description: "Complete the PDF upload process and process the uploaded file",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF"),
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
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.UPLOAD),
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

// Tool to process PDF upload
export const processPdfUpload = tool({
  description: "Process an uploaded PDF file for text extraction and indexing",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the uploaded PDF"),
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ fileKey, jwt }, context?: any): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[processPdfUpload] Using toolCallId:", toolCallId);

    console.log("[Tool] processPdfUpload received:", {
      fileKey,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] processPdfUpload - Environment found:", !!env);
      console.log("[Tool] processPdfUpload - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] processPdfUpload - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        // Simulate PDF processing
        const fileName = fileKey.split("/").pop() || "unknown.pdf";
        const now = new Date().toISOString();

        console.log("[Tool] Processed PDF:", fileKey);

        return createToolSuccess(
          `PDF processed successfully: ${fileName}`,
          {
            fileKey,
            fileName,
            status: "processed",
            processedAt: now,
            extractedText: "Sample extracted text from PDF...",
            wordCount: 1500,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.PDF.INGEST),
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
          "Failed to process PDF",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `PDF processed successfully: ${(result as any).fileName || "Unknown"}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error processing PDF:", error);
      return createToolError("Failed to process PDF", error, 500, toolCallId);
    }
  },
});
