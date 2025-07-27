import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, AUTH_CODES, type ToolResult } from "../constants";
import { authenticatedFetch, handleAuthError } from "../lib/toolAuth";

// Tool to upload and process character sheet files
const uploadCharacterSheet = tool({
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
  execute: async ({
    campaignId,
    fileName,
    fileType,
    characterName,
    description,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] uploadCharacterSheet received:", {
      campaignId,
      fileName,
      fileType,
      characterName,
    });

    try {
      // Generate upload URL for character sheet
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
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${uploadResponse.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to generate upload URL: ${uploadResponse.status}`,
          data: { error: `HTTP ${uploadResponse.status}` },
        };
      }

      const uploadData = (await uploadResponse.json()) as {
        uploadUrl: string;
        fileKey: string;
        characterSheetId: string;
      };

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Character sheet upload URL generated successfully for ${fileName}`,
        data: {
          uploadUrl: uploadData.uploadUrl,
          fileKey: uploadData.fileKey,
          characterSheetId: uploadData.characterSheetId,
          instructions:
            "Use the upload URL to upload your character sheet file, then call processCharacterSheet to extract character data",
        },
      };
    } catch (error) {
      console.error("Error generating character sheet upload URL:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to generate upload URL: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to process uploaded character sheet and extract character data
const processCharacterSheet = tool({
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
  execute: async ({
    characterSheetId,
    campaignId,
    extractData = true,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] processCharacterSheet received:", {
      characterSheetId,
      campaignId,
      extractData,
    });

    try {
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
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to process character sheet: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as {
        success: boolean;
        character?: any;
        extractedData?: any;
        message: string;
      };

      return {
        code: AUTH_CODES.SUCCESS,
        message: result.message || "Character sheet processed successfully",
        data: {
          character: result.character,
          extractedData: result.extractedData,
          characterSheetId,
        },
      };
    } catch (error) {
      console.error("Error processing character sheet:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to process character sheet: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to create character from chat input
const createCharacterFromChat = tool({
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
  execute: async ({
    campaignId,
    characterInfo,
    characterName,
    jwt,
  }): Promise<ToolResult> => {
    console.log("[Tool] createCharacterFromChat received:", {
      campaignId,
      characterName,
    });

    try {
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
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to create character from chat: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
      }

      const result = (await response.json()) as any;

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Successfully created character ${characterName} from chat information`,
        data: {
          character: result.character,
          characterName,
          source: "chat",
        },
      };
    } catch (error) {
      console.error("Error creating character from chat:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to create character from chat: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

// Tool to list character sheets for a campaign
const listCharacterSheets = tool({
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
  execute: async ({ campaignId, jwt }): Promise<ToolResult> => {
    console.log("[Tool] listCharacterSheets received JWT:", jwt);

    try {
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
          return {
            code: AUTH_CODES.INVALID_KEY,
            message: authError,
            data: { error: `HTTP ${response.status}` },
          };
        }
        return {
          code: AUTH_CODES.ERROR,
          message: `Failed to list character sheets: ${response.status}`,
          data: { error: `HTTP ${response.status}` },
        };
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

      return {
        code: AUTH_CODES.SUCCESS,
        message: `Found ${result.characterSheets.length} character sheet(s) for campaign ${campaignId}`,
        data: { characterSheets: result.characterSheets },
      };
    } catch (error) {
      console.error("Error listing character sheets:", error);
      return {
        code: AUTH_CODES.ERROR,
        message: `Failed to list character sheets: ${error instanceof Error ? error.message : String(error)}`,
        data: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  },
});

export const characterSheetTools = {
  uploadCharacterSheet,
  processCharacterSheet,
  createCharacterFromChat,
  listCharacterSheets,
};
