import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../../app-constants";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { generateCharacterWithAI } from "./ai-helpers";
import { getDAOFactory } from "../../dao/dao-factory";
import type { Env } from "../../middleware/auth";

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

// Tool to store character information
export const storeCharacterInfo = tool({
  description:
    "Store detailed character information including backstory, personality, goals, and relationships for intelligent campaign suggestions",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    characterName: z.string().describe("The name of the character"),
    characterClass: z
      .string()
      .optional()
      .describe("The character's class (e.g., Fighter, Wizard, etc.)"),
    characterLevel: z.number().optional().describe("The character's level"),
    characterRace: z.string().optional().describe("The character's race"),
    backstory: z
      .string()
      .optional()
      .describe("The character's backstory and history"),
    personalityTraits: z
      .string()
      .optional()
      .describe("The character's personality traits and quirks"),
    goals: z
      .string()
      .optional()
      .describe("The character's goals and motivations"),
    relationships: z
      .array(z.string())
      .optional()
      .describe("Array of relationships with other characters/NPCs"),
    metadata: z
      .record(z.any())
      .optional()
      .describe("Additional character metadata"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
      backstory,
      personalityTraits,
      goals,
      relationships,
      metadata,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[storeCharacterInfo] Using toolCallId:", toolCallId);

    console.log("[Tool] storeCharacterInfo received:", {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] storeCharacterInfo - Environment found:", !!env);
      console.log("[Tool] storeCharacterInfo - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] storeCharacterInfo - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY,
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

        // Store the character as an entity
        const daoFactory = getDAOFactory(env as Env);
        const characterId = crypto.randomUUID();

        // Create character entity
        await daoFactory.entityDAO.createEntity({
          id: characterId,
          campaignId,
          entityType: "characters",
          name: characterName,
          content: {
            characterName,
            characterClass: characterClass || undefined,
            characterLevel: characterLevel || undefined,
            characterRace: characterRace || undefined,
            backstory: backstory || undefined,
            personalityTraits: personalityTraits || undefined,
            goals: goals || undefined,
            relationships: relationships || undefined,
          },
          metadata: {
            ...metadata,
            sourceType: "user_stored",
          },
          sourceType: "user_stored",
        });

        console.log(
          "[Tool] Stored character as entity:",
          characterId,
          "name:",
          characterName
        );

        return createToolSuccess(
          `Successfully stored character information for ${characterName}`,
          {
            id: characterId,
            entityType: "characters",
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            backstory,
            personalityTraits,
            goals,
            relationships,
            metadata,
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CHARACTERS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            backstory,
            personalityTraits,
            goals,
            relationships,
            metadata,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to store character information",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Successfully stored character information for ${characterName}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error storing character information:", error);
      return createToolError(
        "Failed to store character information",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Tool to generate character using AI
export const generateCharacterWithAITool = tool({
  description:
    "Generate a complete character using AI based on provided parameters and campaign context",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    characterName: z.string().describe("The name of the character to generate"),
    characterClass: z
      .string()
      .optional()
      .describe("The character's class (e.g., Fighter, Wizard, etc.)"),
    characterLevel: z.number().optional().describe("The character's level"),
    characterRace: z.string().optional().describe("The character's race"),
    campaignSetting: z
      .string()
      .optional()
      .describe("The campaign setting or world"),
    playerPreferences: z
      .string()
      .optional()
      .describe("Player preferences for character generation"),
    partyComposition: z
      .array(z.string())
      .optional()
      .describe("Array of existing party members for relationship generation"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
      campaignSetting,
      playerPreferences,
      partyComposition,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[generateCharacterWithAITool] Using toolCallId:", toolCallId);

    console.log("[Tool] generateCharacterWithAI received:", {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] generateCharacterWithAI - Environment found:", !!env);
      console.log("[Tool] generateCharacterWithAI - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] generateCharacterWithAI - User ID extracted:",
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

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id, name FROM campaigns WHERE id = ? AND username = ?"
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

        // Generate character using AI
        const characterData = await generateCharacterWithAI({
          characterName,
          characterClass,
          characterLevel: characterLevel || 1, // Default to level 1 if undefined
          characterRace,
          campaignSetting,
          playerPreferences,
          partyComposition,
          campaignName: campaignResult.name,
          toolCallId,
        });

        // Store the generated character as an entity
        const daoFactory = getDAOFactory(env as Env);
        const characterId = crypto.randomUUID();
        const characterDataTyped = characterData.result.data as any;

        await daoFactory.entityDAO.createEntity({
          id: characterId,
          campaignId,
          entityType: "characters",
          name: characterDataTyped.characterName,
          content: {
            characterName: characterDataTyped.characterName,
            characterClass: characterDataTyped.characterClass,
            characterLevel: characterDataTyped.characterLevel,
            characterRace: characterDataTyped.characterRace,
            backstory: characterDataTyped.backstory,
            personalityTraits: characterDataTyped.personalityTraits,
            goals: characterDataTyped.goals,
            relationships: characterDataTyped.relationships,
            ...(characterDataTyped.metadata || {}),
          },
          metadata: {
            ...(characterDataTyped.metadata || {}),
            sourceType: "ai_generated",
            generatedWithAI: true,
          },
          sourceType: "ai_generated",
        });

        console.log(
          "[Tool] Generated and stored character as entity:",
          characterId,
          "name:",
          characterDataTyped.characterName
        );

        return createToolSuccess(
          `Successfully created character ${characterDataTyped.characterName} using AI generation`,
          {
            id: characterId,
            entityType: "characters",
            ...characterDataTyped,
          },
          toolCallId
        );
      }

      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CAMPAIGNS.CHARACTERS(campaignId)
        ),
        {
          method: "POST",
          jwt,
          body: JSON.stringify({
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            campaignSetting,
            playerPreferences,
            partyComposition,
            generateWithAI: true,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(
            authError,
            null,
            AUTH_CODES.INVALID_KEY,
            toolCallId
          );
        }
        return createToolError(
          "Failed to generate character with AI",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        "Successfully generated character using AI",
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error generating character with AI:", error);
      return createToolError(
        "Failed to generate character with AI",
        error,
        500,
        toolCallId
      );
    }
  },
});
