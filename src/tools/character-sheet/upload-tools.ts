import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
} from "../utils";

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

// Tool to upload a character sheet
export const uploadCharacterSheet = tool({
  description:
    "Upload a character sheet file (PDF, image, or document) for a campaign",
  parameters: z.object({
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
  }),
  execute: async (
    { campaignId, fileName, fileContent, characterName, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[uploadCharacterSheet] Using toolCallId:", toolCallId);

    console.log("[Tool] uploadCharacterSheet received:", {
      campaignId,
      fileName,
      characterName,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] uploadCharacterSheet - Environment found:", !!env);
      console.log("[Tool] uploadCharacterSheet - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
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

        // Store character sheet file
        const characterId = crypto.randomUUID();
        const now = new Date().toISOString();
        const fileSize = Math.round((fileContent.length * 3) / 4); // Approximate base64 size

        await env.DB.prepare(
          "INSERT INTO character_sheets (id, campaign_id, character_name, file_name, file_content, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
          .bind(
            characterId,
            campaignId,
            characterName || "Unknown Character",
            fileName,
            fileContent,
            fileSize,
            now,
            now
          )
          .run();

        // Update campaign updated_at
        await env.DB.prepare("UPDATE campaigns SET updated_at = ? WHERE id = ?")
          .bind(now, campaignId)
          .run();

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

// Tool to process a character sheet
export const processCharacterSheet = tool({
  description:
    "Process and extract information from an uploaded character sheet",
  parameters: z.object({
    characterSheetId: z
      .string()
      .describe("The ID of the character sheet to process"),
    jwt: commonSchemas.jwt,
  }),
  execute: async (
    { characterSheetId, jwt },
    context?: any
  ): Promise<ToolResult> => {
    // Extract toolCallId from context
    const toolCallId = context?.toolCallId || "unknown";
    console.log("[processCharacterSheet] Using toolCallId:", toolCallId);

    console.log("[Tool] processCharacterSheet received:", {
      characterSheetId,
    });

    try {
      // Try to get environment from context or global scope
      const env = getEnvFromContext(context);
      console.log("[Tool] processCharacterSheet - Environment found:", !!env);
      console.log("[Tool] processCharacterSheet - JWT provided:", !!jwt);

      // If we have environment, work directly with the database
      if (env) {
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

        // Get character sheet
        const characterSheet = await env.DB.prepare(
          "SELECT cs.*, c.username FROM character_sheets cs JOIN campaigns c ON cs.campaign_id = c.id WHERE cs.id = ? AND c.username = ?"
        )
          .bind(characterSheetId, userId)
          .first();

        if (!characterSheet) {
          return createToolError(
            "Character sheet not found",
            "Character sheet not found",
            404,
            toolCallId
          );
        }

        // Process the character sheet (extract information)
        const processedData = await processCharacterSheetData(characterSheet);

        // Update character sheet with processed data
        const now = new Date().toISOString();
        await env.DB.prepare(
          "UPDATE character_sheets SET processed_data = ?, processed_at = ?, updated_at = ? WHERE id = ?"
        )
          .bind(JSON.stringify(processedData), now, now, characterSheetId)
          .run();

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
async function processCharacterSheetData(characterSheet: any): Promise<any> {
  // This is a simplified processing function
  // In a real implementation, this would use OCR or AI to extract character information
  const processedData = {
    characterName: characterSheet.character_name || "Unknown",
    characterClass: characterSheet.character_class || "Unknown",
    characterLevel: characterSheet.character_level || 1,
    characterRace: characterSheet.character_race || "Unknown",
    // Add more extracted fields as needed
    extractedAt: new Date().toISOString(),
    confidence: 0.8, // Confidence score for extracted data
  };

  return processedData;
}
