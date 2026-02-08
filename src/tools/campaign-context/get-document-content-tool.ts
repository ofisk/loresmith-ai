import { tool } from "ai";
import { z } from "zod";
import {
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "../utils";
import { getDAOFactory } from "@/dao/dao-factory";

const getDocumentContentSchema = z.object({
  campaignId: z
    .string()
    .describe(
      "Campaign ID. The document must be linked to this campaign as a resource."
    ),
  fileIdentifier: z
    .string()
    .describe(
      "File name or display name of the document (e.g. 'istelle-character-sheet.pdf' or 'D&D Character Sheet'). Matches campaign resource file_name or display_name."
    ),
  jwt: z.string().nullable().optional().describe("JWT for authentication"),
  maxChunks: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(50)
    .describe(
      "Maximum number of text chunks to return (default 50). Use to limit response size."
    ),
});

/**
 * Get indexed text content from a document linked to a campaign.
 * Resolves file by name (file_name or display_name) from campaign resources,
 * then returns chunked text so the agent can answer questions about the document.
 */
export const getDocumentContent = tool({
  description:
    "Get the indexed text content of a document that is linked to the campaign (e.g. a PDF or file added as a campaign resource). Use when you need to read or answer questions about what a specific file says. Provide the file name or display name (e.g. 'istelle-character-sheet.pdf'). Returns text chunks from the document.",
  inputSchema: getDocumentContentSchema,
  execute: async (
    input: z.infer<typeof getDocumentContentSchema>,
    options?: ToolExecuteOptions
  ) => {
    const { campaignId, fileIdentifier, jwt, maxChunks } = input;
    const toolCallId = options?.toolCallId ?? "unknown";

    try {
      const env = getEnvFromContext(options);
      if (!env?.DB) {
        return createToolError(
          "Document content is only available in server context",
          "Server context required",
          503,
          toolCallId
        );
      }

      const userId = extractUsernameFromJwt(jwt);
      if (!userId) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          401,
          toolCallId
        );
      }

      const daoFactory = getDAOFactory(env);
      const campaign = await daoFactory.campaignDAO.getCampaignById(campaignId);
      if (!campaign || campaign.username !== userId) {
        return createToolError(
          "Campaign not found or access denied",
          "Campaign not found",
          404,
          toolCallId
        );
      }

      const resources =
        await daoFactory.campaignDAO.getCampaignResources(campaignId);
      const identifierLower = fileIdentifier.trim().toLowerCase();
      const resource = resources.find((r) => {
        const name = (r.file_name ?? "").toLowerCase();
        const display = (r.display_name ?? "").toLowerCase();
        return (
          name === identifierLower ||
          display === identifierLower ||
          name.includes(identifierLower) ||
          display.includes(identifierLower)
        );
      });

      if (!resource) {
        return createToolError(
          `No campaign resource found matching "${fileIdentifier}". List campaign resources or use the exact file name.`,
          "Document not found",
          404,
          toolCallId
        );
      }

      const fileKey = resource.file_key;
      const chunks = await daoFactory.fileDAO.getFileChunksForRag(
        fileKey,
        userId
      );

      if (!chunks || chunks.length === 0) {
        return createToolSuccess(
          `Document "${resource.file_name}" is linked to the campaign but has no indexed text chunks yet. It may still be processing.`,
          {
            fileKey,
            fileName: resource.file_name,
            displayName: resource.display_name,
            chunks: [],
            chunkCount: 0,
          },
          toolCallId
        );
      }

      const limited = chunks
        .slice(0, maxChunks)
        .map((c: { chunk_index: number; chunk_text: string }) => ({
          index: c.chunk_index,
          text: c.chunk_text,
        }));

      return createToolSuccess(
        `Retrieved ${limited.length} text chunk(s) from "${resource.file_name}" (${chunks.length} total).`,
        {
          fileKey,
          fileName: resource.file_name,
          displayName: resource.display_name,
          chunks: limited,
          chunkCount: limited.length,
          totalChunks: chunks.length,
        },
        toolCallId
      );
    } catch (err) {
      console.error("[getDocumentContent] Error:", err);
      return createToolError(
        "Failed to get document content",
        err,
        500,
        toolCallId
      );
    }
  },
});
