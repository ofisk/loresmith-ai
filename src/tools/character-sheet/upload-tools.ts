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
  type ToolExecuteOptions,
} from "../utils";

const uploadCharacterSheetSchema = z.object({
  campaignId: commonSchemas.campaignId,
  fileName: z.string().describe("The name of the character sheet file"),
  fileContent: z
    .string()
    .describe("Base64 encoded content of the character sheet file"),
  characterName: z
    .string()
    .optional()
    .describe("The name of the character (if known)"),
  jwt: commonSchemas.jwt,
});

export const uploadCharacterSheet = tool({
  description:
    "Upload a character sheet file (PDF, image, or document) for a campaign",
  inputSchema: uploadCharacterSheetSchema,
  execute: async (
    input: z.infer<typeof uploadCharacterSheetSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, fileName, fileContent, characterName, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[uploadCharacterSheet] Using toolCallId:", toolCallId);

    console.log("[Tool] uploadCharacterSheet received:", {
      campaignId,
      fileName,
      characterName,
    });

    try {
      const env = getEnvFromContext(options);
      console.log("[Tool] uploadCharacterSheet - Environment found:", !!env);
      console.log("[Tool] uploadCharacterSheet - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env?.DB) {
        const userId = extractUsernameFromJwt(jwt);
        console.log("[Tool] uploadCharacterSheet - User ID extracted:", userId);

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
        const fileSize = Math.round((fileContent.length * 3) / 4); // Approximate base64 size

        await daoFactory.characterSheetDAO.createFromFile({
          id: characterId,
          campaignId,
          characterName: characterName || "Unknown Character",
          fileName,
          fileContent,
          fileSize,
          createdAt: now,
          updatedAt: now,
        });
        await daoFactory.campaignDAO.touchUpdatedAt(campaignId);

        console.log("[Tool] Uploaded character sheet:", characterId);

        return createToolSuccess(
          `Successfully uploaded character sheet: ${fileName}`,
          {
            id: characterId,
            fileName,
            characterName: characterName || "Unknown Character",
            fileSize,
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
            fileName,
            fileContent,
            characterName,
          }),
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to upload character sheet",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Successfully uploaded character sheet: ${fileName}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error uploading character sheet:", error);
      return createToolError(
        "Failed to upload character sheet",
        error,
        500,
        toolCallId
      );
    }
  },
});

const processCharacterSheetSchema = z.object({
  characterSheetId: z
    .string()
    .describe("The ID of the character sheet to process"),
  jwt: commonSchemas.jwt,
});

export const processCharacterSheet = tool({
  description:
    "Process and extract information from an uploaded character sheet",
  inputSchema: processCharacterSheetSchema,
  execute: async (
    input: z.infer<typeof processCharacterSheetSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { characterSheetId, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[processCharacterSheet] Using toolCallId:", toolCallId);

    console.log("[Tool] processCharacterSheet received:", {
      characterSheetId,
    });

    try {
      const env = getEnvFromContext(options);
      console.log("[Tool] processCharacterSheet - Environment found:", !!env);
      console.log("[Tool] processCharacterSheet - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env?.DB) {
        const userId = extractUsernameFromJwt(jwt);
        console.log(
          "[Tool] processCharacterSheet - User ID extracted:",
          userId
        );

        if (!userId) {
          return createToolError(
            "Invalid authentication token",
            "Authentication failed",
            401,
            toolCallId
          );
        }

        const daoFactory = getDAOFactory(env);
        const characterSheet =
          await daoFactory.characterSheetDAO.getByIdAndUsername(
            characterSheetId,
            userId
          );

        if (!characterSheet) {
          return createToolError(
            "Character sheet not found",
            "Character sheet not found",
            404,
            toolCallId
          );
        }

        const processedData = await processCharacterSheetData(characterSheet);
        const now = new Date().toISOString();
        await daoFactory.characterSheetDAO.updateProcessedData(
          characterSheetId,
          JSON.stringify(processedData),
          now,
          now
        );

        console.log("[Tool] Processed character sheet:", characterSheetId);

        return createToolSuccess(
          `Successfully processed character sheet: ${characterSheet.character_name}`,
          {
            id: characterSheetId,
            characterName: characterSheet.character_name,
            processedData,
            processedAt: now,
          },
          toolCallId
        );
      }

      // Otherwise, make HTTP request
      const response = await authenticatedFetch(
        API_CONFIG.buildUrl(
          API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.PROCESS(characterSheetId)
        ),
        {
          method: "POST",
          jwt,
        }
      );

      if (!response.ok) {
        const authError = await handleAuthError(response);
        if (authError) {
          return createToolError(authError, null, 401, toolCallId);
        }
        return createToolError(
          "Failed to process character sheet",
          `HTTP ${response.status}: ${await response.text()}`,
          500,
          toolCallId
        );
      }

      const result = await response.json();
      return createToolSuccess(
        `Successfully processed character sheet: ${(result as any).characterName || "Unknown"}`,
        result,
        toolCallId
      );
    } catch (error) {
      console.error("Error processing character sheet:", error);
      return createToolError(
        "Failed to process character sheet",
        error,
        500,
        toolCallId
      );
    }
  },
});

// Helper function to process character sheet data
async function processCharacterSheetData(
  characterSheet: import("@/dao/character-sheet-dao").CharacterSheetRow
): Promise<Record<string, unknown>> {
  // This is a simplified processing function
  // In a real implementation, this would use OCR or AI to extract character information
  return {
    characterName: characterSheet.character_name || "Unknown",
    characterClass: characterSheet.character_class || "Unknown",
    characterLevel: characterSheet.character_level ?? 1,
    characterRace: characterSheet.character_race || "Unknown",
    extractedAt: new Date().toISOString(),
    confidence: 0.8,
  };
}
