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

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[listPdfFiles] Using toolCallId:", toolCallId);

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
            "Failed to list PDF files",
            `HTTP ${response.status}: ${await response.text()}`,
            500,
            toolCallId
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
            { files: [], count: 0, username },
            toolCallId
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
          },
          toolCallId
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
            "Failed to list PDF files",
            `HTTP ${response.status}: ${await response.text()}`,
            500,
            toolCallId
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
            { files: [], count: 0 },
            toolCallId
          );
        }

        return createToolSuccess(
          `Found ${result.files.length} PDF file(s): ${result.files.map((f) => f.fileName).join(", ")}`,
          {
            files: result.files,
            count: result.files.length,
          },
          toolCallId
        );
      }
    } catch (error) {
      console.error("Error listing PDF files:", error);
      return createToolError("Error listing PDF files", error, 500, toolCallId);
    }
  },
});

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
});

// Execution functions for confirmation-required tools
export const deletePdfFileExecution = async (
  { fileKey, jwt }: { fileKey: string; jwt?: string },
  context?: any
): Promise<ToolResult> => {
  console.log(
    "[deletePdfFileExecution] Starting deletion for fileKey:",
    fileKey
  );
  console.log("[deletePdfFileExecution] Context:", context);

  const toolCallId = context?.toolCallId || "unknown";
  console.log("[deletePdfFileExecution] Using toolCallId:", toolCallId);

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

    console.log(
      "[deletePdfFileExecution] Constructing delete URL for fileKey:",
      fileKey
    );
    const deleteUrl = `${API_CONFIG.getApiBaseUrl()}/rag/pdfs/${encodeURIComponent(fileKey)}`;
    console.log("[deletePdfFileExecution] Delete URL:", deleteUrl);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (jwt) {
      headers.Authorization = `Bearer ${jwt}`;
      console.log(
        "[deletePdfFileExecution] JWT provided, adding Authorization header"
      );
    } else {
      console.log("[deletePdfFileExecution] No JWT provided");
    }

    console.log(
      "[deletePdfFileExecution] Making DELETE request to:",
      deleteUrl
    );
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers,
    });

    console.log("[deletePdfFileExecution] Response status:", response.status);
    console.log("[deletePdfFileExecution] Response ok:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[deletePdfFileExecution] Delete failed with status:",
        response.status
      );
      console.error("[deletePdfFileExecution] Error response:", errorText);

      return createToolError(
        "Failed to delete PDF file",
        `HTTP ${response.status}: ${errorText}`,
        500,
        toolCallId
      );
    }

    const responseText = await response.text();
    console.log(
      "[deletePdfFileExecution] Delete successful, response:",
      responseText
    );

    // Verify the file was actually deleted by trying to list files
    console.log(
      "[deletePdfFileExecution] Verifying deletion by listing files..."
    );
    const listResponse = await fetch(
      `${API_CONFIG.getApiBaseUrl()}/pdf/files`,
      {
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
      }
    );

    if (listResponse.ok) {
      const files = (await listResponse.json()) as any[];
      const fileStillExists = files.some(
        (file: any) => file.file_key === fileKey
      );
      console.log(
        "[deletePdfFileExecution] File still exists in list:",
        fileStillExists
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

    console.log("[deletePdfFileExecution] Deletion verified successful");
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
            "Failed to get PDF stats",
            `HTTP ${response.status}: ${await response.text()}`,
            500,
            toolCallId
          );
        }
        const result = (await response.json()) as {
          totalFiles: number;
          totalSize: number;
          averageFileSize: number;
        };

        return createToolSuccess(
          `PDF statistics: ${result.totalFiles} files uploaded, ${(result.totalSize / 1024 / 1024).toFixed(2)} MB total size, ${(result.averageFileSize / 1024 / 1024).toFixed(2)} MB average file size`,
          result,
          toolCallId
        );
      }
    } catch (error) {
      console.error("Error getting PDF stats:", error);
      return createToolError("Error getting PDF stats", error, 500, toolCallId);
    }
  },
});
