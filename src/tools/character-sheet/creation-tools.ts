import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { CampaignContextSyncService } from "../../services/campaign-context-sync-service";

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

// Tool to create a character sheet
export const createCharacterSheet = tool({
  description:
    "Create a new character sheet for a campaign with basic character information",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    characterName: z.string().describe("The name of the character"),
    characterClass: z.string().describe("The character's class"),
    characterLevel: z.number().describe("The character's level"),
    characterRace: z.string().describe("The character's race"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[createCharacterSheet] Using toolCallId:", toolCallId);

    console.log("[Tool] createCharacterSheet received:", {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] createCharacterSheet - Environment found:", !!env);
      console.log("[Tool] createCharacterSheet - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] createCharacterSheet - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError(
            "Campaign not found",
            "Campaign not found",
            404,
            toolCallId
          );
        }

        // Create character sheet
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO character_sheets (id, campaign_id, character_name, character_class, character_level, character_race, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log("[Tool] Created character sheet:", characterId);

        // Sync to AutoRAG for searchability
        try {
          const syncService = new CampaignContextSyncService(env);
          const characterData = {
            class: characterClass,
            level: characterLevel,
            race: characterRace,
          };
          await syncService.syncCharacterSheetToAutoRAG(
            campaignId,
            characterId,
            characterName,
            characterData
          );
          console.log("[Tool] Synced character sheet to AutoRAG:", characterId);
        } catch (syncError) {
          console.error(
            "[Tool] Failed to sync character sheet to AutoRAG:",
            syncError
          );
          // Don't fail the whole operation if sync fails
        }

        return createToolSuccess(
          `Successfully created character sheet for ${characterName}`,
          {
            id: characterId,
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            createdAt: now,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.UPLOAD_URL),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            campaignId,
            characterName,
            characterClass,
            characterLevel,
            characterRace,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to create character sheet",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Successfully created character sheet for ${characterName}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error creating character sheet:", error);
      return createToolError(
        "Failed to create character sheet",
        error,
        500,
        toolCallId
      );
    }
  },
});
