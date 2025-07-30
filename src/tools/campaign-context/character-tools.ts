import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";
import { generateCharacterWithAI } from "./ai-helpers";

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
            AUTH_CODES.INVALID_KEY
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError("Campaign not found", "Campaign not found");
        }

        // Store the character information
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_characters (id, campaign_id, character_name, character_class, character_level, character_race, backstory, personality_traits, goals, relationships, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterName,
            characterClass || null,
            characterLevel || null,
            characterRace || null,
            backstory || null,
            personalityTraits || null,
            goals || null,
            relationships ? JSON.stringify(relationships) : null,
            metadata ? JSON.stringify(metadata) : null,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log(
          "[Tool] Stored character info directly:",
          characterId,
          "name:",
          characterName
        );

        return createToolSuccess(
          `Successfully stored character information for ${characterName}`,
          {
            id: characterId,
            characterName,
            characterClass,
            characterLevel,
            characterRace,
            backstory,
            personalityTraits,
            goals,
            relationships,
            metadata,
            createdAt: now,
          }
        );
      }

      // Otherwise, make HTTP request
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
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, AUTH_CODES.INVALID_KEY);
        }
        return createToolError(
          `Failed to store character info: ${response.status}`,
          `HTTP ${response.status}`
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Successfully stored character information for ${characterName}`,
        result
      );
    } catch (error) {
      console.error("Error storing character info:", error);
      return createToolError(
        `Failed to store character info: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  },
});

// Tool to create a character using AI with user confirmation
export const createCharacter = tool({
  description:
    "Create a new character for a campaign using AI generation. This tool will generate a complete character sheet including stats, backstory, personality, and goals. Requires user confirmation before creating.",
  parameters: z.object({
    campaignId: commonSchemas.campaignId,
    characterName: z.string().describe("The name of the character"),
    characterClass: z
      .string()
      .optional()
      .describe(
        "The character's class (e.g., Fighter, Wizard, etc.) - if not provided, AI will suggest one"
      ),
    characterLevel: z
      .number()
      .optional()
      .describe("The character's level (defaults to 1)"),
    characterRace: z
      .string()
      .optional()
      .describe("The character's race - if not provided, AI will suggest one"),
    campaignSetting: z
      .string()
      .optional()
      .describe("The campaign setting or theme to inform character creation"),
    playerPreferences: z
      .string()
      .optional()
      .describe(
        "Any specific player preferences or requirements for the character"
      ),
    partyComposition: z
      .array(z.string())
      .optional()
      .describe(
        "Array of existing party members to consider for party balance"
      ),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    {
      campaignId,
      characterName,
      characterClass,
      characterLevel = 1,
      characterRace,
      campaignSetting,
      playerPreferences,
      partyComposition,
      jwt,
    },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] createCharacter received:", {
      campaignId,
      characterName,
      characterClass,
      characterLevel,
      characterRace,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] createCharacter - Environment found:", !!env);
      console.log("[Tool] createCharacter - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] createCharacter - User ID extracted:", userId);

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            AUTH_CODES.INVALID_KEY
          );
        }

        // Verify campaign exists and belongs to user
        const campaignResult = await env.DB.prepare(
          "SELECT id, name FROM campaigns WHERE id = ? AND username = ?"
        )
          .bind(campaignId, userId)
          .first();

        if (!campaignResult) {
          return createToolError("Campaign not found", "Campaign not found");
        }

        // Generate character data using AI
        const characterData = await generateCharacterWithAI({
          characterName,
          characterClass,
          characterLevel,
          characterRace,
          campaignSetting,
          playerPreferences,
          partyComposition,
          campaignName: campaignResult.name,
        });

        // Store the character information
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();

        await env.DB.prepare(
          "INSERT INTO campaign_characters (id, campaign_id, character_name, character_class, character_level, character_race, backstory, personality_traits, goals, relationships, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterData.characterName,
            characterData.characterClass,
            characterData.characterLevel,
            characterData.characterRace,
            characterData.backstory,
            characterData.personalityTraits,
            characterData.goals,
            JSON.stringify(characterData.relationships),
            characterData.metadata
              ? JSON.stringify(characterData.metadata)
              : null,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

        console.log(
          "[Tool] Created character with AI:",
          characterId,
          "name:",
          characterData.characterName
        );

        return createToolSuccess(
          `Successfully created character ${characterData.characterName} using AI generation`,
          {
            id: characterId,
            ...characterData,
            createdAt: now,
            requiresConfirmation: true,
          }
        );
      }

      // Otherwise, make HTTP request
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
            useAI: true,
          }),
        }
      );

      if (!response.ok) {
        const authError = handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, AUTH_CODES.INVALID_KEY);
        }
        return createToolError(
          `Failed to create character: ${response.status}`,
          `HTTP ${response.status}`
        );
      }

      const result = (await response.json()) as any;
      return createToolSuccess(
        `Successfully created character ${characterName} using AI generation`,
        { ...result, requiresConfirmation: true }
      );
    } catch (error) {
      console.error("Error creating character:", error);
      return createToolError(
        `Failed to create character: ${error instanceof Error ? error.message : String(error)}`,
        error
      );
    }
  },
});
