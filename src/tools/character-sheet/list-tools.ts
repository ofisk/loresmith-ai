import { tool } from "ai";
import { z } from "zod";
import { API_CONFIG, type ToolResult } from "../../app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import {
  getEnvFromContext,
  createToolError,
  createToolSuccess,
  type ToolExecuteOptions,
} from "../utils";
import { authenticatedFetch, handleAuthError } from "../../lib/tool-auth";
import { AUTH_CODES } from "../../shared-config";

const listCharacterSheetsSchema = z.object({
  campaignId: z
    .string()
    .describe("The ID of the campaign to list character sheets for"),
  jwt: z
    .string()
    .nullable()
    .optional()
    .describe("JWT token for authentication"),
});

export const listCharacterSheets = tool({
  description: "List all character sheets associated with a campaign",
  inputSchema: listCharacterSheetsSchema,
  execute: async (
    input: z.infer<typeof listCharacterSheetsSchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const { campaignId, jwt } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[Tool] listCharacterSheets received JWT:", jwt);
    console.log("[Tool] listCharacterSheets context:", options);

    try {
      const env = getEnvFromContext(options);
      console.log("[listCharacterSheets] Environment from context:", !!env);
      console.log(
        "[listCharacterSheets] DB binding exists:",
        env?.DB !== undefined
      );

      if (env?.DB) {
        console.log(
          "[listCharacterSheets] Running in Durable Object context, calling database directly"
        );

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

        const daoFactory = getDAOFactory(env);
        const campaign =
          await daoFactory.campaignDAO.getCampaignByIdWithMapping(
            campaignId,
            username
          );
        if (!campaign) {
          return createToolError(
            "Campaign not found",
            {
              error: "Campaign not found",
            },
            AUTH_CODES.ERROR,
            toolCallId
          );
        }

        const characterSheets =
          await daoFactory.characterSheetDAO.listByCampaign(campaignId);
        console.log(
          "[listCharacterSheets] Listing character sheets for campaign:",
          campaignId,
          "count:",
          characterSheets.length
        );

        const result = characterSheets.map((cs) => ({
          id: cs.id,
          fileName: cs.fileName ?? "",
          fileType: cs.fileType,
          characterName: cs.characterName,
          status: cs.status,
          createdAt: cs.createdAt,
        }));

        return createToolSuccess(
          `Found ${result.length} character sheet(s) for campaign ${campaignId}`,
          {
            characterSheets: result,
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
