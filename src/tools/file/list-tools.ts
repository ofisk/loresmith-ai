import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import {
  getLibraryRagService,
  getLibraryService,
} from "../../lib/service-factory";
import type { FileResponse } from "../../types/file";
import { fileHelpers } from "../../types/file";
import { createToolError, createToolSuccess } from "../utils";

// File listing tools

export const listFiles = tool({
  description: "List all uploaded files for the current user",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listFiles received JWT:", jwt);
    console.log("[Tool] listFiles context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    const env = context?.env;
    console.log("[listFiles] Using toolCallId:", toolCallId);

    try {
      console.log("[listFiles] Using JWT:", jwt);

      // Extract username from JWT
      let username = "default";
      if (jwt) {
        try {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          username = payload.username || "default";
          console.log("[listFiles] Extracted username from JWT:", username);
        } catch (error) {
          console.error("Error parsing JWT:", error);
        }
      }

      console.log("[listFiles] Listing files for username:", username);

      // Check if we're running in the Worker environment (have access to env bindings)
      // This determines whether we can make direct service calls or need HTTP requests
      if (env?.DB) {
        console.log(
          "[listFiles] Running in Worker environment, calling database directly"
        );

        // Call the library service directly
        const ragService = getLibraryRagService(env);
        const files = await ragService.searchFiles({
          query: "",
          userId: username,
          limit: 20,
          offset: 0,
        });

        console.log("[listFiles] Direct database call result:", files);

        if (!files || files.length === 0) {
          return createToolSuccess(
            `No files found for user "${username}". Upload something to get started!`,
            { files: [], count: 0, username },
            toolCallId
          );
        }

        // Convert SearchResult[] to File[] format for compatibility
        const fileList = files
          .map(
            (file) =>
              `- ${file.file_name} (${(file.file_size / 1024 / 1024).toFixed(2)} MB)`
          )
          .join("\n");

        return createToolSuccess(
          `📄 Found ${files.length} file(s) for user "${username}":\n${fileList}`,
          {
            files: files,
            count: files.length,
            username,
          },
          toolCallId
        );
      }

      // Fallback to HTTP call when not running in Worker environment
      // This could be browser, Node.js, or other environments without env bindings
      console.log(
        "[listFiles] Running in non-Worker environment, making HTTP call"
      );
      console.log(
        "[listFiles] JWT being used:",
        jwt ? `${jwt.substring(0, 20)}...` : "null"
      );
      console.log(
        "[listFiles] Endpoint being called:",
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES, env)
      );

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES, env),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );

      console.log("[listFiles] Response status:", response.status);
      console.log("[listFiles] Response ok:", response.ok);

      if (!response.ok) {
        return createToolError(
          "Failed to list files",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = (await response.json()) as FileResponse;
      console.log("[listFiles] Response body:", result);
      console.log("[listFiles] Files array:", result.files);
      console.log("[listFiles] Files length:", result.files?.length || 0);

      if (!result.files || result.files.length === 0) {
        return createToolSuccess(
          `No files found for user "${username}". Upload something to get started!`,
          { files: [], count: 0, username },
          toolCallId
        );
      }

      const fileList = fileHelpers.formatFileList(result.files);

      return createToolSuccess(
        `📄 Found ${result.files.length} file(s) for user "${username}":\n${fileList}`,
        {
          files: result.files,
          count: result.files.length,
          username,
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error listing files:", error);
      return createToolError("Error listing files", error, 500, toolCallId);
    }
  },
});

// Execution functions for confirmation-required tools
export const deleteFileExecution = async (
  { fileKey, jwt }: { fileKey: string; jwt?: string | null },
  context?: any
): Promise<ToolResult> => {
  console.log("[deleteFileExecution] Starting deletion for fileKey:", fileKey);

  const toolCallId = context?.toolCallId || "unknown";
  const env = context?.env;

  try {
    if (!fileKey) {
      console.error("[deleteFileExecution] No fileKey provided");
      return createToolError(
        "No file key provided for deletion",
        "Missing fileKey",
        400,
        toolCallId
      );
    }

    // Check if we're running in the Worker environment (have access to env bindings)
    if (env?.DB) {
      console.log(
        "[deleteFileExecution] Running in Worker environment, calling database directly"
      );

      // Extract username from JWT for database operations
      let username = "anonymous";
      if (jwt) {
        try {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          username = payload.username || "anonymous";
        } catch (error) {
          console.warn(
            "[deleteFileExecution] Failed to parse JWT, using anonymous:",
            error
          );
        }
      }

      // Get the library service for direct database access
      const libraryService = getLibraryService(env);

      // Delete the file using the service
      const deleteResult = await libraryService.deleteFile(fileKey, username);

      if (deleteResult.success) {
        return createToolSuccess(
          `Successfully deleted file: ${fileKey}`,
          { status: "deleted", fileKey, username },
          toolCallId
        );
      } else {
        return createToolError(
          "Failed to delete file from database",
          deleteResult.error || "Unknown error",
          500,
          toolCallId
        );
      }
    }

    // Fallback to HTTP call when not running in Worker environment
    // This could be browser, Node.js, or other environments without env bindings
    console.log(
      "[deleteFileExecution] Running in non-Worker environment, making HTTP call"
    );

    const deleteUrl = API_CONFIG.buildUrl(
      API_CONFIG.ENDPOINTS.RAG.DELETE_FILE(fileKey),
      env
    );
    console.log("[deleteFileExecution] Delete URL:", deleteUrl);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (jwt) {
      headers.Authorization = `Bearer ${jwt}`;
    }

    console.log("[deleteFileExecution] Making DELETE request to:", deleteUrl);
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "[deleteFileExecution] Delete failed with status:",
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
        "Failed to delete file",
        `HTTP ${response.status}: ${errorText}`,
        500,
        toolCallId
      );
    }

    // Verify the file was actually deleted by trying to list files
    const listResponse = await fetch(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES, env),
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
              "[deleteFileExecution] File was not actually deleted from database"
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
          "[deleteFileExecution] Could not verify deletion:",
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
    console.error("[deleteFileExecution] Unexpected error:", error);
    return createToolError(
      "Unexpected error during file deletion",
      error,
      500,
      toolCallId
    );
  }
};

export const deleteFile = tool({
  description:
    "Delete a specific file for the current user. This action requires confirmation before execution.",
  parameters: z.object({
    fileKey: z.string().describe("The file key of the file to delete"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: deleteFileExecution,
});

export const getFileStats = tool({
  description: "Get statistics about uploaded files",
  parameters: z.object({
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] getFileStats received JWT:", jwt);
    console.log("[Tool] getFileStats context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[getFileStats] Using toolCallId:", toolCallId);

    try {
      console.log("[getFileStats] Using JWT:", jwt);

      // Extract username from JWT
      let username = "default";
      if (jwt) {
        try {
          const payload = JSON.parse(atob(jwt.split(".")[1]));
          username = payload.username || "default";
          console.log("[getFileStats] Extracted username from JWT:", username);
        } catch (error) {
          console.error("Error parsing JWT:", error);
        }
      }

      console.log("[getFileStats] Getting stats for username:", username);

      // Call the server endpoint to get actual stats
      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.STATS),
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
          "Failed to get file stats",
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
      console.error("Error getting file stats:", error);
      return createToolError(
        "Error getting file stats",
        error,
        500,
        toolCallId
      );
    }
  },
});
