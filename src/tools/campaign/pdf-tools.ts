import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { AUTH_CODES } from "../../shared";
import { commonSchemas, createToolError, createToolSuccess } from "../utils";

// PDF library tools

export const searchPdfLibrary = tool({
  description:
    "Search through the user's PDF library for resources relevant to campaign planning, world-building, or specific topics",
  parameters: z.object({
    query: z
      .string()
      .describe("The search query to find relevant PDF resources"),
    context: z
      .string()
      .optional()
      .describe("Additional context about what the user is looking for"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results to return (default: 5)"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { query, context, limit = 5, jwt },
    aiContext?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] searchPdfLibrary received query:", query);
    console.log("[Tool] searchPdfLibrary aiContext:", aiContext);

    // Extract toolCallId from AI SDK context
    const toolCallId = aiContext?.toolCallId || "unknown";
    console.log("[searchPdfLibrary] Using toolCallId:", toolCallId);

    try {
      console.log("[searchPdfLibrary] Using JWT:", jwt);

      const searchPayload = {
        query: context ? `${query} ${context}` : query,
        limit,
      };

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.SEARCH),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify(searchPayload),
        }
      );

      console.log("[searchPdfLibrary] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[searchPdfLibrary] Error response:", errorText);
        return createToolError(
          `Failed to search PDF library: ${response.status} - ${errorText}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const result = (await response.json()) as {
        results: Array<{
          chunk: {
            id: string;
            file_key: string;
            chunk_text: string;
            chunk_index: number;
            metadata?: Record<string, any>;
          };
          score: number;
          metadata?: Record<string, any>;
        }>;
      };

      if (!result.results || result.results.length === 0) {
        return createToolSuccess(
          "No relevant resources found in your PDF library for this query.",
          { results: [], empty: true },
          toolCallId
        );
      }

      // Group results by PDF file and format for better presentation
      const groupedResults = result.results.reduce(
        (acc, item) => {
          const fileName =
            item.chunk.file_key.split("/").pop() || "Unknown PDF";
          if (!acc[fileName]) {
            acc[fileName] = {
              fileName,
              fileKey: item.chunk.file_key,
              chunks: [],
              relevanceScore: 0,
            };
          }
          acc[fileName].chunks.push({
            text: item.chunk.chunk_text,
            score: item.score,
            index: item.chunk.chunk_index,
          });
          acc[fileName].relevanceScore += item.score;
          return acc;
        },
        {} as Record<string, any>
      );

      const sortedResults = Object.values(groupedResults)
        .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

      return createToolSuccess(
        `Found ${sortedResults.length} relevant resources in your PDF library: ${sortedResults.map((r: any) => r.fileName).join(", ")}`,
        {
          results: sortedResults,
          empty: false,
          count: sortedResults.length,
          query,
        },
        toolCallId
      );
    } catch (error) {
      console.error("Error searching PDF library:", error);
      return createToolError(
        `Failed to search PDF library: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});

export const getPdfLibraryStats = tool({
  description:
    "Get statistics about the user's PDF library to understand available resources",
  parameters: z.object({
    jwt: commonSchemas.jwt,
  }),
  execute: async ({ jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] getPdfLibraryStats received JWT:", jwt);
    console.log("[Tool] getPdfLibraryStats context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[getPdfLibraryStats] Using toolCallId:", toolCallId);

    try {
      console.log("[getPdfLibraryStats] Using JWT:", jwt);

      const response = await fetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.RAG.PDFS),
        {
          method: "GET",
          headers: {
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
        }
      );

      console.log("[getPdfLibraryStats] Response status:", response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[getPdfLibraryStats] Error response:", errorText);
        return createToolError(
          `Failed to get PDF library stats: ${response.status} - ${errorText}`,
          { error: `HTTP ${response.status}` },
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      const result = (await response.json()) as {
        pdfs: Array<{
          file_key: string;
          file_name: string;
          description?: string;
          tags?: string[];
          file_size: number;
          created_at: string;
          status: string;
        }>;
      };

      if (!result.pdfs || result.pdfs.length === 0) {
        return createToolSuccess(
          "Your PDF library is empty. Consider uploading some D&D resources to get started with campaign planning!",
          { pdfs: [], empty: true },
          toolCallId
        );
      }

      // Analyze the library for campaign planning insights
      const totalFiles = result.pdfs.length;
      const totalSize = result.pdfs.reduce(
        (sum, pdf) => sum + pdf.file_size,
        0
      );
      const processedFiles = result.pdfs.filter(
        (pdf) => pdf.status === "processed"
      ).length;

      // Categorize PDFs by tags and descriptions
      const categories = result.pdfs.reduce(
        (acc, pdf) => {
          const tags = pdf.tags || [];
          const description = pdf.description || "";
          const fileName = pdf.file_name.toLowerCase();

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
        `Your PDF library contains ${totalFiles} files (${processedFiles} processed) with ${(totalSize / 1024 / 1024).toFixed(1)}MB of content. Available categories: ${Object.entries(
          categories
        )
          .map(([cat, count]) => `${cat} (${count})`)
          .join(", ")}`,
        {
          pdfs: result.pdfs,
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
      console.error("Error getting PDF library stats:", error);
      return createToolError(
        `Failed to get PDF library stats: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
