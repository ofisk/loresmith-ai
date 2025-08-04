import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import { createToolError, createToolSuccess } from "../utils";
import { AUTH_CODES } from "../../shared";

// Character sheet listing tools

export const listCharacterSheets = tool({
  description: "List all character sheets associated with a campaign",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to list character sheets for"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async ({ campaignId, jwt }, context?: any): Promise<ToolResult> => {
    console.log("[Tool] listCharacterSheets received JWT:", jwt);
    console.log("[Tool] listCharacterSheets context:", context);

    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[listCharacterSheets] Using toolCallId:", toolCallId);

    try {
      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[listCharacterSheets] Environment from context:", !!env);
      console.log(
        "[listCharacterSheets] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[listCharacterSheets] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[listCharacterSheets] Extracted username from JWT:",
              username
            );
          } catch (error) {
            console.error("Error parsing JWT:", error);
          }
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, username)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            {
              error: "Campaign not found",
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }

        // For now, return a simple response since character sheets are not stored in the database yet
        // In a real implementation, this would query a character_sheets table
        console.log(
          "[listCharacterSheets] Listing character sheets for campaign:",
          campaignId
        );

        return createToolSuccess(
          `Found 0 character sheet(s) for campaign ${campaignId}`,
          {
            characterSheets: [],
            campaignId,
          },
          toolCallId
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[listCharacterSheets] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.LIST(campaignId)
          ),
          {
            method: "GET",
            jwt,
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(
              authError,
              {
                error: `HTTP ${response.status}`,
              },
              AUTH_CODES.ERROR,
              toolCallId
            );
          }
          return createToolError(
            `Failed to list character sheets: ${response.status}`,
            { error: `HTTP ${response.status}` },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }

        const result = (await response.json()) as {
          characterSheets: Array<{
            id: string;
            fileName: string;
            fileType: string;
            characterName?: string;
            status: string;
            createdAt: string;
          }>;
        };

        return createToolSuccess(
          `Found ${result.characterSheets.length} character sheet(s) for campaign ${campaignId}`,
          { characterSheets: result.characterSheets },
          toolCallId
        );
      }
    } catch (error) {
      console.error("Error listing character sheets:", error);
      return createToolError(
        `Failed to list character sheets: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
