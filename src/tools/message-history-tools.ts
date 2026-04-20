import { tool } from "ai";
import { z } from "zod";
import { AUTH_CODES, type ToolResult } from "@/app-constants";
import { getDAOFactory } from "@/dao/dao-factory";
import { validateCampaignOwnership } from "@/lib/campaign-operations";
import { EnvironmentRequiredError } from "@/lib/errors";
import {
	buildMessageHistoryDaoOptions,
	type MessageHistoryScope,
	normalizeMessageHistoryScope,
} from "@/lib/get-message-history-query";
import {
	commonSchemas,
	createToolError,
	createToolSuccess,
	extractUsernameFromJwt,
	getEnvFromContext,
	type ToolExecuteOptions,
} from "./utils";

const historyScopeSchema = z
	.enum(["current_session", "campaign", "account"])
	.optional()
	.default("current_session")
	.describe(
		"current_session: this chat thread only (default). campaign: all persisted messages you sent for the selected campaign across every LoreSmith chat session. account: your messages across all campaigns and sessions; requires afterDate, beforeDate, or searchQuery to keep the query bounded."
	);

const getMessageHistorySchema = z.object({
	sessionId: z
		.string()
		.optional()
		.describe(
			"Chat session ID. Used when historyScope is current_session; otherwise omit and rely on historyScope plus filters."
		),
	campaignId: z
		.string()
		.optional()
		.nullable()
		.describe(
			"Campaign ID filter. Required when historyScope is campaign. Ignored for account scope."
		),
	historyScope: historyScopeSchema,
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

function accountScopeHasBound(
	searchQuery: string | undefined,
	afterDate: string | undefined,
	beforeDate: string | undefined
): boolean {
	const q = searchQuery?.trim();
	return Boolean(
		(q && q.length > 0) ||
			(afterDate && afterDate.trim().length > 0) ||
			(beforeDate && beforeDate.trim().length > 0)
	);
}

/**
 * Tool to retrieve message history from persistent storage
 * Agents can use this to fetch relevant conversation history when needed
 */
export const getMessageHistory = tool({
	description: `Retrieve persisted chat messages you are allowed to see (same user as the JWT). Not everything is in the model's live context.

historyScope:
- **current_session** (default): this durable chat thread only; sessionId is filled from context if omitted.
- **campaign**: every message you stored for the **selected campaign** across all sessions (new tab, refresh, or past days). Pass campaignId or rely on the selected campaign from the app. Use this when the user asks for "my chat history" for this campaign regardless of session.
- **account**: your messages across **all** campaigns and sessions. You MUST pass at least one of afterDate, beforeDate, or searchQuery so the query stays bounded.

Use afterDate/beforeDate (ISO 8601), searchQuery, limit (up to 100), and offset for paging. Each row includes sessionId so you can cite which thread it came from.`,
	inputSchema: getMessageHistorySchema,
	execute: async (
		input: z.infer<typeof getMessageHistorySchema>,
		options?: ToolExecuteOptions
	): Promise<ToolResult> => {
		const {
			sessionId,
			campaignId,
			historyScope: historyScopeRaw,
			role,
			limit = 20,
			offset = 0,
			searchQuery,
			beforeDate,
			afterDate,
			jwt,
		} = input;
		const historyScope: MessageHistoryScope =
			normalizeMessageHistoryScope(historyScopeRaw);
		const toolCallId = options?.toolCallId ?? "unknown";

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

			if (historyScope === "current_session" && !finalSessionId) {
				return createToolError(
					"Session ID is required for current_session scope.",
					"Missing session ID",
					AUTH_CODES.ERROR,
					toolCallId
				);
			}

			if (historyScope === "campaign") {
				const cid =
					typeof campaignId === "string" && campaignId.length > 0
						? campaignId
						: "";
				if (!cid) {
					return createToolError(
						"historyScope campaign requires a campaignId (select a campaign in the app).",
						"Missing campaign ID",
						AUTH_CODES.ERROR,
						toolCallId
					);
				}
				const ownershipCheck = await validateCampaignOwnership(
					cid,
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

			if (historyScope === "account") {
				if (!accountScopeHasBound(searchQuery, afterDate, beforeDate)) {
					return createToolError(
						"historyScope account requires at least one of: afterDate, beforeDate, or searchQuery.",
						"Unbounded account history",
						AUTH_CODES.ERROR,
						toolCallId
					);
				}
			}

			if (
				historyScope !== "account" &&
				typeof campaignId === "string" &&
				campaignId.length > 0
			) {
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

			const probeOpts = buildMessageHistoryDaoOptions({
				username,
				sessionId:
					historyScope === "current_session" ? finalSessionId : undefined,
				campaignId:
					historyScope === "campaign"
						? (campaignId as string)
						: historyScope === "current_session"
							? campaignId
							: undefined,
				role,
				limit: 1,
				offset: 0,
				searchQuery,
				beforeDate,
				afterDate,
			});

			const probe = await daoFactory.messageHistoryDAO.getMessages(probeOpts);
			if (probe.length === 0) {
				return createToolSuccess(
					"No message history found for the requested filters.",
					{
						messages: [],
						total: 0,
						historyScope,
					},
					toolCallId
				);
			}

			const listOpts = buildMessageHistoryDaoOptions({
				username,
				sessionId:
					historyScope === "current_session" ? finalSessionId : undefined,
				campaignId:
					historyScope === "campaign"
						? (campaignId as string)
						: historyScope === "current_session"
							? campaignId
							: undefined,
				role,
				limit,
				offset,
				searchQuery,
				beforeDate,
				afterDate,
			});

			const messages = await daoFactory.messageHistoryDAO.getMessages(listOpts);

			const messagesWithParsedData = messages.map((msg) => {
				let parsedData: Record<string, unknown> | null = null;
				if (msg.messageData) {
					try {
						parsedData = JSON.parse(msg.messageData) as Record<string, unknown>;
					} catch (_error) {}
				}

				return {
					...msg,
					messageData: parsedData,
				};
			});

			return createToolSuccess(
				`Retrieved ${messagesWithParsedData.length} message(s) from history (${historyScope}).`,
				{
					messages: messagesWithParsedData,
					total: messagesWithParsedData.length,
					historyScope,
				},
				toolCallId
			);
		} catch (error) {
			return createToolError(
				`Failed to retrieve message history: ${error instanceof Error ? error.message : String(error)}`,
				{ error: error instanceof Error ? error.message : String(error) },
				AUTH_CODES.ERROR,
				toolCallId
			);
		}
	},
});
