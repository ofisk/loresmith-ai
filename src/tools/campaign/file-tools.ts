import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { AUTH_CODES } from "../../shared-config";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  type ToolExecuteOptions,
} from "../utils";

const searchFileLibrarySchema = z.object({
  query: z.string().describe("The search query to find relevant PDF resources"),
  context: z
    .string()
    .optional()
    .describe("Additional context about what the user is looking for"),
  limit: z
    .number()
    .optional()
    .describe("Maximum number of results to return (default: 5)"),
  jwt: commonSchemas.jwt,
});

// file library tools

export const searchFileLibrary = tool({
  description:
    "Search through the user's file library for resources relevant to campaign planning, world-building, or specific topics",
  inputSchema: searchFileLibrarySchema,
  execute: async (
    input: z.infer<typeof searchFileLibrarySchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { query, context, limit = 5, jwt } = input;
    console.log("[Tool] searchFileLibrary received query:", query);
    console.log("[Tool] searchFileLibrary options:", options);

    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[searchFileLibrary] Using toolCallId:", toolCallId);

    try {
      console.log("[searchFileLibrary] Using JWT:", jwt);

      const searchQuery = context ? `${query} ${context}` : query;
      const searchUrl = new URL(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.SEARCH)
      );
      searchUrl.searchParams.set("q", searchQuery);
      searchUrl.searchParams.set("limit", limit.toString());

      const response = await fetch(searchUrl.toString(), {
        method: "GET",
        headers: {
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
      });

      console.log("[searchFileLibrary] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[searchFileLibrary] Error response:", errorText);
        return createToolError(
          `Failed to search file library: ${response.status} - ${errorText}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const result = (await response.json()) as {
        success: boolean;
        results: Array<{
          file_key: string;
          file_name: string;
          description?: string;
          tags?: string[];
          file_size: number;
          created_at: string;
          status: string;
        }>;
        query: string;
        pagination: {
          limit: number;
          offset: number;
          total: number;
        };
      };

      if (!result.results || result.results.length === 0) {
        return createToolSuccess(
          "No relevant resources found in your file library for this query.",
          { results: [], empty: true },
          toolCallId
        );
      }

      // Format results for better presentation
      const formattedResults = result.results.map((file) => ({
        fileName: file.file_name,
        fileKey: file.file_key,
        description: file.description || "No description available",
        tags: file.tags || [],
        fileSize: file.file_size,
        status: file.status,
        createdAt: file.created_at,
      }));

      return createToolSuccess(
        `Found ${formattedResults.length} relevant resources in your file library: ${formattedResults.map((r) => r.fileName).join(", ")}`,
        {
          results: formattedResults,
          empty: false,
          count: formattedResults.length,
          query,
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error searching file library:", error);
      return createToolError(
        `Failed to search file library: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

const getFileLibraryStatsSchema = z.object({
  jwt: commonSchemas.jwt,
});

export const getFileLibraryStats = tool({
  description:
    "Get statistics about the user's file library to understand available resources",
  inputSchema: getFileLibraryStatsSchema,
  execute: async (
    input: z.infer<typeof getFileLibraryStatsSchema>,
    options: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[Tool] getFileLibraryStats received JWT:", jwt);
    console.log("[Tool] getFileLibraryStats options:", options);
    console.log("[getFileLibraryStats] Using toolCallId:", toolCallId);

    try {
      console.log("[getFileLibraryStats] Using JWT:", jwt);

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.LIBRARY.FILES),
        {
          method: "GET",
          headers: {
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );

      console.log("[getFileLibraryStats] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[getFileLibraryStats] Error response:", errorText);
        return createToolError(
          `Failed to get file library stats: ${response.status} - ${errorText}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const result = (await response.json()) as {
        success: boolean;
        files: Array<{
          file_key: string;
          file_name: string;
          description?: string;
          tags?: string[];
          file_size: number;
          created_at: string;
          status: string;
        }>;
        pagination: {
          limit: number;
          offset: number;
          total: number;
        };
      };

      if (!result.files || result.files.length === 0) {
        return createToolSuccess(
          "Your file library is empty. Consider uploading some game resources to get started with campaign planning!",
          { files: [], empty: true },
          toolCallId
        );
      }

      // Analyze the library for campaign planning insights
      const totalFiles = result.files.length;
      const totalSize = result.files.reduce(
        (sum, file) => sum + (file.file_size || 0),
        0
      );
      const processedFiles = result.files.filter(
        (file) => file.status === "completed" || file.status === "processed"
      ).length;

      // Categorize files by tags and descriptions
      const categories = result.files.reduce(
        (acc, file) => {
          const tags = file.tags || [];
          const description = file.description || "";
          const fileName = file.file_name.toLowerCase();

          // Simple categorization logic
          if (
            tags.some((tag) => tag.toLowerCase().includes("monster")) ||
            description.toLowerCase().includes("monster") ||
            fileName.includes("monster")
          ) {
            acc.monsters = (acc.monsters || 0) + 1;
          }
          if (
            tags.some((tag) => tag.toLowerCase().includes("spell")) ||
            description.toLowerCase().includes("spell") ||
            fileName.includes("spell")
          ) {
            acc.spells = (acc.spells || 0) + 1;
          }
          if (
            tags.some((tag) => tag.toLowerCase().includes("adventure")) ||
            description.toLowerCase().includes("adventure") ||
            fileName.includes("adventure")
          ) {
            acc.adventures = (acc.adventures || 0) + 1;
          }
          if (
            tags.some((tag) => tag.toLowerCase().includes("world")) ||
            description.toLowerCase().includes("world") ||
            fileName.includes("world")
          ) {
            acc.worldBuilding = (acc.worldBuilding || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>
      );

      return createToolSuccess(
        `Your file library contains ${totalFiles} files (${processedFiles} processed) with ${(totalSize / 1024 / 1024).toFixed(1)}MB of content. Available categories: ${Object.entries(
          categories
        )
          .map(([cat, count]) => `${cat} (${count})`)
          .join(", ")}`,
        {
          files: result.files,
          empty: false,
          stats: {
            totalFiles,
            processedFiles,
            totalSizeMB: totalSize / 1024 / 1024,
            categories,
          },
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error getting file library stats:", error);
      return createToolError(
        `Failed to get file library stats: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
