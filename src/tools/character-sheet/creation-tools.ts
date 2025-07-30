import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import { createToolError, createToolSuccess } from "../utils";

// Character sheet creation tools

export const createCharacterFromChat = tool({
  description:
    "Create a character from information provided in chat, extracting character details from the conversation",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to add the character to"),
    characterInfo: z
      .string()
      .describe("The character information extracted from chat conversation"),
    characterName: z.string().describe("The name of the character"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    { campaignId, characterInfo, characterName, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] createCharacterFromChat received:", {
      campaignId,
      characterName,
    });
    console.log("[Tool] createCharacterFromChat context:", context);
    try {
      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[createCharacterFromChat] Environment from context:", !!env);
      console.log(
        "[createCharacterFromChat] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[createCharacterFromChat] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[createCharacterFromChat] Extracted username from JWT:",
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
          return createToolError("Campaign not found", {
            error: "Campaign not found",
          });
        }

        // Store the character information
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_characters (id, campaign_id, character_name, backstory, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterName,
            characterInfo,
            JSON.stringify({
              source: "chat",
              createdFromChat: true,
            }),
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log(
          "[createCharacterFromChat] Created character from chat:",
          characterId
        );

        return createToolSuccess(
          `Successfully created character ${characterName} from chat information`,
          {
            character: {
              id: characterId,
              characterName,
              backstory: characterInfo,
              source: "chat",
              createdAt: now,
            },
            characterName,
            source: "chat",
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[createCharacterFromChat] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CAMPAIGNS.CHARACTERS(campaignId)
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              characterName,
              characterInfo,
              source: "chat",
              createdFromChat: true,
            }),
          }
        );

        if (!response.ok) {
          const authError = handleAuthError(response);
          if (authError) {
            return createToolError(authError, {
              error: `HTTP ${response.status}`,
            });
          }
          return createToolError(
            `Failed to create character from chat: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const result = (await response.json()) as any;

        return createToolSuccess(
          `Successfully created character ${characterName} from chat information`,
          {
            character: result.character,
            characterName,
            source: "chat",
          }
        );
      }
    } catch (error) {
      console.error("Error creating character from chat:", error);
      return createToolError(
        `Failed to create character from chat: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
