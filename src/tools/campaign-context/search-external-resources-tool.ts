import type { D1Database } from "@cloudflare/workers-types";
import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import { getDAOFactory } from "../../dao/dao-factory";

/**
 * Tool to suggest where users can search for external resources (DMs Guild, Reddit, etc.).
 * Returns pre-filled search links, not live search results. Real search would require
 * a search API (e.g. Serper, Tavily) and an env key; LLMs cannot browse the web.
 * Use only when the user asks for external inspiration; for campaign entities use searchCampaignContext.
 */
const searchExternalResourcesSchema = z.object({
  campaignId: commonSchemas.campaignId,
  query: z.string().describe("The search query for external resources"),
  resourceType: z
    .enum(["adventures", "maps", "characters", "monsters", "items", "worlds"])
    .optional()
    .describe("Type of external resource to search for"),
  jwt: commonSchemas.jwt,
});

export const searchExternalResources = tool({
  description:
    "Suggest where to search for external resources (DMs Guild, Reddit, etc.) with the user's query pre-filled. Returns links the user can open to search themselves—not live search results. Use when users explicitly ask for external inspiration or reference materials. If they ask about entities 'from my campaign' or 'in my world', use searchCampaignContext instead.",
  inputSchema: searchExternalResourcesSchema,
  execute: async (
    input: z.infer<typeof searchExternalResourcesSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, query, resourceType, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[searchExternalResources] Using toolCallId:", toolCallId);

    console.log("[Tool] searchExternalResources received:", {
      campaignId,
      query,
      resourceType,
    });

    try {
      const env = getEnvFromContext(options);
      console.log("[Tool] searchExternalResources - Environment found:", !!env);
      console.log("[Tool] searchExternalResources - JWT provided:", !!jwt);

      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] searchExternalResources - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }

        const campaignDAO = getDAOFactory(
          env as { DB: D1Database }
        ).campaignDAO;
        const campaign = await campaignDAO.getCampaignByIdWithMapping(
          campaignId,
          userId
        );

        if (!campaign) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Pre-filled search links; not live results. Real search would require a search API (Serper, Tavily, etc.).
        const suggestedSearchLinks = [
          {
            label: "DMs Guild",
            url: `https://dmsguild.com/search?q=${encodeURIComponent(query)}`,
            description: `Search DMs Guild for ${resourceType || "adventure"} content`,
          },
          {
            label: "r/DMAcademy",
            url: `https://reddit.com/r/DMAcademy/search?q=${encodeURIComponent(query)}`,
            description: "Search Reddit for GM advice and discussions",
          },
          {
            label: "r/DnD",
            url: `https://reddit.com/r/DnD/search?q=${encodeURIComponent(query)}`,
            description: "Search Reddit for D&D community content",
          },
        ];

        return createToolSuccess(
          `Suggested ${suggestedSearchLinks.length} places to search for "${query}". Share these links so the user can open and search; these are not live results.`,
          {
            query,
            resourceType,
            suggestedSearchLinks,
            note: "These are pre-filled search links. Open them to see real results; live web search is not available.",
          },
          toolCallId
        );
      }

      return createToolError(
        "Environment not available for external resource search",
        "Unable to access external resources",
        500,
        toolCallId
      );
    } catch (error) {
      console.error("Error searching external resources:", error);
      return createToolError(
        "Failed to search external resources",
        error,
        500,
        toolCallId
      );
    }
  },
});
