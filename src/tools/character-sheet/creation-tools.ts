import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
} from "../utils";
import type { Env } from "@/middleware/auth";
import { CampaignContextSyncService } from "@/services/campaign/campaign-context-sync-service";

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
      if (env?.DB) {
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

        const daoFactory = getDAOFactory(env);
        const campaign =
          await daoFactory.campaignDAO.getCampaignByIdWithMapping(
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

        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await daoFactory.characterSheetDAO.createFromForm({
          id: characterId,
          campaignId,
          characterName,
          characterClass,
          characterLevel,
          characterRace,
          createdAt: now,
          updatedAt: now,
        });
        await daoFactory.campaignDAO.touchUpdatedAt(campaignId);

        console.log("[Tool] Created character sheet:", characterId);

        // Sync to RAG for searchability
        try {
          const syncService = new CampaignContextSyncService(env as Env);
          const characterData = {
            class: characterClass,
            level: characterLevel,
            race: characterRace,
          };
          await syncService.syncCharacterSheet(
            campaignId,
            characterId,
            characterName,
            characterData
          );
          console.log("[Tool] Synced character sheet:", characterId);
        } catch (syncError) {
          console.error("[Tool] Failed to sync character sheet:", syncError);
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
