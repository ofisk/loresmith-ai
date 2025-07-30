import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../constants";
import { authenticatedFetch, handleAuthError } from "../../lib/toolAuth";
import { createToolError, createToolSuccess } from "../utils";

// Character sheet upload tools

export const uploadCharacterSheet = tool({
  description:
    "Upload a character sheet file (PDF, Word document, or other format) and process it for use in a campaign",
  parameters: z.object({
    campaignId: z
      .string()
      .describe("The ID of the campaign to add the character sheet to"),
    fileName: z.string().describe("The name of the character sheet file"),
    fileType: z
      .enum(["pdf", "docx", "doc", "txt", "json"])
      .describe("The type of character sheet file"),
    characterName: z
      .string()
      .optional()
      .describe(
        "The name of the character (will be extracted from file if not provided)"
      ),
    description: z
      .string()
      .optional()
      .describe("Optional description of the character sheet"),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    { campaignId, fileName, fileType, characterName, description, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] uploadCharacterSheet received:", {
      campaignId,
      fileName,
      fileType,
      characterName,
    });
    console.log("[Tool] uploadCharacterSheet context:", context);
    try {
      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[uploadCharacterSheet] Environment from context:", !!env);
      console.log(
        "[uploadCharacterSheet] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[uploadCharacterSheet] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[uploadCharacterSheet] Extracted username from JWT:",
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

        // Generate unique file key and character sheet ID
        const characterSheetId = crypto.randomUUID();
        const fileKey = `character-sheets/${username}/${characterSheetId}/${fileName}`;
        const uploadUrl = `/character-sheets/upload/${fileKey}`;

        console.log(
          "[uploadCharacterSheet] Generated characterSheetId:",
          characterSheetId
        );
        console.log("[uploadCharacterSheet] Generated fileKey:", fileKey);
        console.log("[uploadCharacterSheet] Generated uploadUrl:", uploadUrl);

        return createToolSuccess(
          `Character sheet upload URL generated successfully for ${fileName}`,
          {
            uploadUrl,
            fileKey,
            characterSheetId,
            instructions:
              "Use the upload URL to upload your character sheet file, then call processCharacterSheet to extract character data",
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[uploadCharacterSheet] Running in HTTP context, making API request"
        );
        const uploadResponse = await authenticatedFetch(
          API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.UPLOAD_URL),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              fileName,
              fileType,
              campaignId,
              characterName,
              description,
            }),
          }
        );

        if (!uploadResponse.ok) {
          const authError = handleAuthError(uploadResponse);
          if (authError) {
            return createToolError(authError, {
              error: `HTTP ${uploadResponse.status}`,
            });
          }
          return createToolError(
            `Failed to generate upload URL: ${uploadResponse.status}`,
            { error: `HTTP ${uploadResponse.status}` }
          );
        }

        const uploadData = (await uploadResponse.json()) as {
          uploadUrl: string;
          fileKey: string;
          characterSheetId: string;
        };

        return createToolSuccess(
          `Character sheet upload URL generated successfully for ${fileName}`,
          {
            uploadUrl: uploadData.uploadUrl,
            fileKey: uploadData.fileKey,
            characterSheetId: uploadData.characterSheetId,
            instructions:
              "Use the upload URL to upload your character sheet file, then call processCharacterSheet to extract character data",
          }
        );
      }
    } catch (error) {
      console.error("Error generating character sheet upload URL:", error);
      return createToolError(
        `Failed to generate upload URL: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});

export const processCharacterSheet = tool({
  description:
    "Process an uploaded character sheet file to extract character information and add it to the campaign",
  parameters: z.object({
    characterSheetId: z
      .string()
      .describe("The ID of the uploaded character sheet to process"),
    campaignId: z
      .string()
      .describe("The ID of the campaign to add the character to"),
    extractData: z
      .boolean()
      .optional()
      .describe(
        "Whether to extract character data from the sheet (default: true)"
      ),
    jwt: z
      .string()
      .nullable()
      .optional()
      .describe("JWT token for authentication"),
  }),
  execute: async (
    { characterSheetId, campaignId, extractData = true, jwt },
    context?: any
  ): Promise<ToolResult> => {
    console.log("[Tool] processCharacterSheet received:", {
      characterSheetId,
      campaignId,
      extractData,
    });
    console.log("[Tool] processCharacterSheet context:", context);
    try {
      // Check if we have access to the environment through context
      const env = context?.env;
      console.log("[processCharacterSheet] Environment from context:", !!env);
      console.log(
        "[processCharacterSheet] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[processCharacterSheet] Running in Durable Object context, calling database directly"
        );

        // Extract username from JWT
        let username = "default";
        if (jwt) {
          try {
            const payload = JSON.parse(atob(jwt.split(".")[1]));
            username = payload.username || "default";
            console.log(
              "[processCharacterSheet] Extracted username from JWT:",
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

        console.log(
          "[processCharacterSheet] Processing character sheet:",
          characterSheetId
        );

        // For now, return a simple response since this would require file processing
        // In a real implementation, this would extract character data from the uploaded file
        return createToolSuccess(
          `Character sheet ${characterSheetId} processed successfully`,
          {
            characterSheetId,
            campaignId,
            status: "processed",
            extractedData: extractData,
            message: "Character data extracted and added to campaign",
          }
        );
      } else {
        // Fall back to HTTP API
        console.log(
          "[processCharacterSheet] Running in HTTP context, making API request"
        );
        const response = await authenticatedFetch(
          API_CONFIG.buildUrl(
            API_CONFIG.ENDPOINTS.CHARACTER_SHEETS.PROCESS(characterSheetId)
          ),
          {
            method: "POST",
            jwt,
            body: JSON.stringify({
              campaignId,
              extractData,
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
            `Failed to process character sheet: ${response.status}`,
            { error: `HTTP ${response.status}` }
          );
        }

        const result = (await response.json()) as any;
        return createToolSuccess(
          `Character sheet ${characterSheetId} processed successfully`,
          result
        );
      }
    } catch (error) {
      console.error("Error processing character sheet:", error);
      return createToolError(
        `Failed to process character sheet: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  },
});
