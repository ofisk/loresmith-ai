import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import type { PdfFileResponse } from "../../types/pdf";
import { pdfFileHelpers } from "../../types/pdf";
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

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[listPdfFiles] Using toolCallId:", toolCallId);

    try {
      console.log("[listPdfFiles] Using JWT:", jwt);

      // Extract username from JWT
      let username = "default";
      if (jwt) {
        try {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          username = payload.username || "default";
          console.log("[listPdfFiles] Extracted username from JWT:", username);
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
          "Failed to list PDF files",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as PdfFileResponse;

      if (!result.files || result.files.length === 0) {
        return createToolSuccess(
          `No PDF files found for user "${username}". Upload some PDFs to get started!`,
          { files: [], count: 0, username },
          toolCallId
        );
      }

      const fileList = pdfFileHelpers.formatFileList(result.files);

      return createToolSuccess(
        `📄 Found ${result.files.length} PDF file(s) for user "${username}":\n${fileList}`,
        {
          files: result.files,
          count: result.files.length,
          username,
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return createToolError("Error listing PDF files", error, 500, toolCallId);
    }
  },
});

// Execution functions for confirmation-required tools
export const deletePdfFileExecution = async (
  { fileKey, jwt }: { fileKey: string; jwt?: string | null },
  context?: any
): Promise<ToolResult> => {
  console.log(
    "[deletePdfFileExecution] Starting deletion for fileKey:",
    fileKey
  );

  const toolCallId = context?.toolCallId || "unknown";

  try {
    if (!fileKey) {
      console.error("[deletePdfFileExecution] No fileKey provided");
      return createToolError(
        "No file key provided for deletion",
        "Missing fileKey",
        400,
        toolCallId
      );
    }

    const deleteUrl = `${API_CONFIG.getApiBaseUrl()}/rag/pdfs/${encodeURIComponent(fileKey)}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (jwt) {
      headers.Authorization = `Bearer ${jwt}`;
    }

    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[deletePdfFileExecution] Delete failed with status:",
        response.status
      );

      // If it's a 404, the file might have already been deleted
      if (response.status === 404) {
        return createToolSuccess(
          "File was already deleted or not found",
          { status: "already_deleted", fileKey },
          toolCallId
        );
      }

      return createToolError(
        "Failed to delete PDF file",
        `HTTP ${response.status}: ${errorText}`,
        500,
        toolCallId
      );
    }

    // Verify the file was actually deleted by trying to list files
    const listResponse = await fetch(
      `${API_CONFIG.getApiBaseUrl()}/pdf/files`,
      {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      }
    );

    if (listResponse.ok) {
      try {
        const responseData = (await listResponse.json()) as any;
        // Handle different response formats
        const files = Array.isArray(responseData)
          ? responseData
          : responseData.files || responseData.data || [];

        if (Array.isArray(files)) {
          const fileStillExists = files.some(
            (file: any) => file.file_key === fileKey
          );

          if (fileStillExists) {
            console.warn(
              "[deletePdfFileExecution] File was not actually deleted from database"
            );
            return createToolError(
              "File deletion reported success but file still exists in database",
              "Deletion verification failed",
              500,
              toolCallId
            );
          }
        }
      } catch (verificationError) {
        console.warn(
          "[deletePdfFileExecution] Could not verify deletion:",
          verificationError
        );
        // Don't fail the deletion if verification fails
      }
    }

    return createToolSuccess(
      `File "${fileKey}" has been successfully deleted`,
      { deletedFile: fileKey },
      toolCallId
    );
  } catch (error) {
    console.error("[deletePdfFileExecution] Unexpected error:", error);
    return createToolError(
      "Unexpected error during file deletion",
      error,
      500,
      toolCallId
    );
  }
};

export const deletePdfFile = tool({
  description:
    "Delete a specific PDF file for the current user. This action requires confirmation before execution.",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the PDF to delete"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: deletePdfFileExecution,
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

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[getPdfStats] Using toolCallId:", toolCallId);

    try {
      console.log("[getPdfStats] Using JWT:", jwt);

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
          "Failed to get PDF stats",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
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
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return createToolError("Error getting PDF stats", error, 500, toolCallId);
    }
  },
});
