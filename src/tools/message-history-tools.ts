import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "../app-constants";
import {
  commonSchemas,
  createToolError,
  createToolSuccess,
  extractUsernameFromJwt,
  getEnvFromContext,
  type ToolExecuteOptions,
} from "./utils";
import { getDAOFactory } from "../dao/dao-factory";
import { EnvironmentRequiredError } from "@/lib/errors";
import { validateCampaignOwnership } from "@/lib/campaign-operations";

const getMessageHistorySchema = z.object({
  sessionId: z
    .string()
    .optional()
    .describe(
      "The chat session ID. If not provided, will be auto-detected from the durable object context."
    ),
  campaignId: z
    .string()
    .optional()
    .nullable()
    .describe(
      "Optional campaign ID to filter messages for a specific campaign"
    ),
  role: z
    .enum(["user", "assistant", "system"])
    .optional()
    .describe("Filter by message role"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe("Maximum number of messages to retrieve (1-100, default: 20)"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe("Number of messages to skip (for pagination)"),
  searchQuery: z
    .string()
    .optional()
    .describe("Search for messages containing this text in the content field"),
  beforeDate: z
    .string()
    .optional()
    .describe(
      "Only retrieve messages before this date (ISO format, e.g., '2026-01-03T00:00:00Z')"
    ),
  afterDate: z
    .string()
    .optional()
    .describe(
      "Only retrieve messages after this date (ISO format, e.g., '2026-01-03T00:00:00Z')"
    ),
  jwt: commonSchemas.jwt,
});

/**
 * Tool to retrieve message history from persistent storage
 * Agents can use this to fetch relevant conversation history when needed
 */
export const getMessageHistory = tool({
  description: `Retrieve message history from persistent storage. Use this tool when you need to reference previous conversation context, such as:
- Understanding follow-up questions (e.g., "the first one" referring to a previous list)
- Recalling what was discussed earlier in the conversation
- Finding context about a topic mentioned in previous messages
- Understanding references to earlier parts of the conversation

The tool supports filtering by:
- Session ID (optional - will be auto-detected from context if not provided)
- Campaign ID (optional, to filter messages for a specific campaign)
- Role (user, assistant, system)
- Date range (before/after specific dates)
- Search query (search within message content)
- Limit and offset for pagination

Only retrieve message history when you actually need it - don't fetch it preemptively.`,
  inputSchema: getMessageHistorySchema,
  execute: async (
    input: z.infer<typeof getMessageHistorySchema>,
    options?: ToolExecuteOptions
  ): Promise<ToolResult> => {
    const {
      sessionId,
      campaignId,
      role,
      limit = 20,
      offset = 0,
      searchQuery,
      beforeDate,
      afterDate,
      jwt,
    } = input;
    const toolCallId = options?.toolCallId ?? "unknown";
    console.log("[getMessageHistory] Using toolCallId:", toolCallId);

    try {
      const env = getEnvFromContext(options);
      if (!env) {
        throw new EnvironmentRequiredError();
      }

      const username = extractUsernameFromJwt(jwt);
      if (!username) {
        return createToolError(
          "Invalid authentication token",
          "Authentication failed",
          AUTH_CODES.INVALID_KEY,
          toolCallId
        );
      }

      const opts = options as { sessionId?: string } | undefined;
      let finalSessionId = sessionId;
      if (!finalSessionId && opts?.sessionId) {
        finalSessionId = opts.sessionId;
      }

      if (!finalSessionId) {
        return createToolError(
          "Session ID is required. It should be auto-detected from context, but if not available, please provide it explicitly.",
          "Missing session ID",
          AUTH_CODES.ERROR,
          toolCallId
        );
      }

      // Validate campaign ownership if campaignId is provided
      if (campaignId) {
        const ownershipCheck = await validateCampaignOwnership(
          campaignId,
          username,
          env
        );
        if (!ownershipCheck.valid) {
          return createToolError(
            "Campaign not found or access denied",
            "You don't have access to this campaign",
            AUTH_CODES.ERROR,
            toolCallId
          );
        }
      }

      const daoFactory = getDAOFactory(env);

      // Verify that the session has messages from this user (security check)
      // This prevents users from accessing other users' sessions by guessing sessionIds
      const sessionCheck = await daoFactory.messageHistoryDAO.getMessages({
        sessionId: finalSessionId,
        username, // Only get messages from this user
        limit: 1, // Just check if any exist
      });

      if (sessionCheck.length === 0) {
        // No messages found for this user in this session
        // This could mean:
        // 1. The session doesn't exist
        // 2. The session belongs to a different user
        // 3. The session has no messages yet
        // Return empty result rather than error to avoid leaking session existence
        return createToolSuccess(
          "No message history found for this session.",
          {
            messages: [],
            total: 0,
          },
          toolCallId
        );
      }

      // Now fetch the actual messages with all filters
      // The username filter ensures users can only see their own messages
      const messages = await daoFactory.messageHistoryDAO.getMessages({
        sessionId: finalSessionId,
        username, // CRITICAL: Always filter by username to prevent cross-user access
        campaignId: campaignId || null,
        role,
        limit,
        offset,
        searchQuery,
        beforeDate,
        afterDate,
      });

      // Parse message data JSON strings back to objects
      const messagesWithParsedData = messages.map((msg) => {
        let parsedData: Record<string, unknown> | null = null;
        if (msg.messageData) {
          try {
            parsedData = JSON.parse(msg.messageData) as Record<string, unknown>;
          } catch (error) {
            console.warn(
              "[getMessageHistory] Failed to parse message data:",
              error
            );
          }
        }

        return {
          ...msg,
          messageData: parsedData,
        };
      });

      return createToolSuccess(
        `Retrieved ${messagesWithParsedData.length} message(s) from history.`,
        {
          messages: messagesWithParsedData,
          total: messagesWithParsedData.length,
        },
        toolCallId
      );
    } catch (error) {
      console.error("[getMessageHistory] Error:", error);
      return createToolError(
        `Failed to retrieve message history: ${error instanceof Error ? error.message : String(error)}`,
        { error: error instanceof Error ? error.message : String(error) },
        AUTH_CODES.ERROR,
        toolCallId
      );
    }
  },
});
