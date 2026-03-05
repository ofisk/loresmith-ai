import { stepCountIs, streamText } from "ai";
import { getGenerationModelForProvider } from "@/app-constants";
import { CAMPAIGN_ROLES, PLAYER_ROLES } from "@/constants/campaign-roles";
import { getDAOFactory } from "@/dao/dao-factory";
import {
	type ResolvedClaimedPlayerContext,
	resolveClaimedPlayerContext,
} from "@/lib/agent-role-utils";
import { getStatusMessageForTool } from "@/lib/agent-status-messages";
import { getEnvVar } from "@/lib/env-utils";
import { buildExplainabilityFromSteps } from "@/lib/explainability-builder";
import { createLogger } from "@/lib/logger";
import { getAgentRoleContext } from "@/lib/prompts/agent-role-context";
import {
	estimateRequestTokens,
	estimateTokenCount,
	estimateToolsTokens,
	getSafeContextLimit,
} from "@/lib/token-utils";
import { trimToolResultsByRelevancy } from "@/lib/tool-result-trimming";
import { RulesContextService } from "@/services/campaign/rules-context-service";
import { AuthService } from "@/services/core/auth-service";
import { EmailService } from "@/services/core/email-service";
import { getLLMRateLimitService } from "@/services/llm/llm-rate-limit-service";
import { submitSupportRequestTool } from "@/tools/common/support-tools";
import type { CampaignRole } from "@/types/campaign";
import type { Explainability } from "@/types/explainability";
import { type ChatMessage, SimpleChatAgent } from "./simple-chat-agent";

interface Env {
	Chat: DurableObjectNamespace;
	[key: string]: unknown;
}

interface MessageData {
	jwt?: string;
}

const TEXT_PART_ID = "text-1";
const TEMPORARY_UNAVAILABLE_MESSAGE =
	"We're sorry for the inconvenience but Loresmith is temporarily unavailable.";
const RATE_LIMIT_UPSELL_MESSAGE =
	"You've hit your usage limit. Visit /billing to upgrade and get higher limits: " +
	"Basic ($9/mo) — 5 campaigns, 25 files, 25MB storage, higher rate limits. " +
	"Pro ($18/mo) — Unlimited campaigns, 100 files, 100MB storage, 2× rate limits.";
const LOW_BALANCE_SUPPORT_THROTTLE_MS = 30 * 60 * 1000;
const LOW_BALANCE_SUPPORT_LAST_REPORTED_AT_KEY =
	"low-balance-support-last-reported-at";

/** Max steps per turn so the agent can use tools as needed until it sends a final text response. */
const MAX_AGENT_STEPS = 20;
const MISSING_PLAYER_CHARACTER_MESSAGE =
	"Choose your character before continuing. Open campaign details and select your character.";
const RULES_AWARE_AGENT_TYPES = new Set([
	"campaign",
	"campaign-context",
	"campaign-analysis",
	"recap",
	"session-digest",
	"rules-reference",
]);

/** Write a single text message as UI stream chunks (text-start, text-delta, text-end). */
function writeTextChunks(
	write: (chunk: object) => void,
	text: string,
	id: string = TEXT_PART_ID
) {
	write({ type: "text-start", id });
	if (text.length > 0) {
		write({ type: "text-delta", id, delta: text });
	}
	write({ type: "text-end", id });
}

/**
 * Normalize stylistic tokens we do not want in assistant generations.
 * Keeps output natural while avoiding "AI-looking" punctuation/styling.
 */
function sanitizeGeneratedAssistantText(text: string): string {
	return (
		text
			.replace(/\s*\u2014\s*/g, " - ")
			// Replace removed emoji with a space so adjacent sentences do not merge.
			.replace(/\p{Extended_Pictographic}/gu, " ")
			.replace(/[\u200D\uFE0F]/g, "")
			// Repair missing sentence spacing like "Now.Done" -> "Now. Done".
			.replace(/([.!?])([A-Z])/g, "$1 $2")
	);
}

function isLowBalanceProviderError(message: string): boolean {
	const m = message.toLowerCase();
	return (
		m.includes("credit balance is too low") ||
		m.includes("insufficient_quota") ||
		(m.includes("quota") && m.includes("billing"))
	);
}

function createDataStreamResponse(options: {
	execute: (dataStream: { write: (chunk: object) => void }) => Promise<void>;
}): Response {
	const encoder = new TextEncoder();

	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const dataStream = {
				write(chunk: object) {
					controller.enqueue(
						encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
					);
				},
			};

			try {
				await options.execute(dataStream);
			} finally {
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
		},
	});
}

/**
 * Abstract base agent class that provides common functionality for specialized agents.
 *
 * This class serves as the foundation for all specialized AI agents in the LoreSmith AI system.
 * It handles common operations like JWT extraction, message processing, and tool management.
 *
 * @extends SimpleChatAgent<Env> - Extends the simple chat agent with environment-specific functionality
 *
 * @example
 * ```typescript
 * class CampaignAgent extends BaseAgent {
 *   constructor(ctx: DurableObjectState, env: Env, model: any) {
 *     super(ctx, env);
 *     this.model = model;
 *     this.tools = campaignTools;
 *   }
 * }
 * ```
 */
export abstract class BaseAgent extends SimpleChatAgent<Env> {
	/** The AI model instance used for generating responses */
	protected model: any;

	/** Collection of tools available to this agent */
	protected tools: Record<string, any>;

	/** Agent metadata for registration and routing */
	static readonly agentMetadata = {
		type: "", // Will be set by subclasses
		description: "", // Will be set by subclasses
		systemPrompt: "", // Will be set by subclasses
		tools: {} as Record<string, any>, // Will be set by subclasses
	};

	private async submitLowBalanceSupportIssue(params: {
		clientJwt: string | null;
		campaignId: string | null;
		lastUserMessage: string;
		errorMessage: string;
	}): Promise<void> {
		try {
			const now = Date.now();
			const lastReportedAt =
				(await this.ctx.storage.get<number>(
					LOW_BALANCE_SUPPORT_LAST_REPORTED_AT_KEY
				)) ?? 0;
			if (now - lastReportedAt < LOW_BALANCE_SUPPORT_THROTTLE_MS) {
				return;
			}

			const username = params.clientJwt
				? AuthService.parseJwtForUsername(params.clientJwt)
				: null;
			const subject = "Automatic alert: Loresmith temporarily unavailable";
			const body = [
				"Automatic support issue created after a provider low-balance error.",
				`Agent: ${this.constructor.name}`,
				`Campaign ID: ${params.campaignId ?? "unknown"}`,
				`Username: ${username ?? "unknown"}`,
				`User request: ${(params.lastUserMessage || "").slice(0, 500)}`,
				`Provider error: ${(params.errorMessage || "").slice(0, 1000)}`,
			].join("\n");

			// Prefer existing support tool path so behavior stays consistent.
			const toolExecute = submitSupportRequestTool.execute;
			if (typeof toolExecute === "function") {
				const result = await toolExecute(
					{
						subject,
						body,
						userConfirmed: true,
						jwt: params.clientJwt,
					},
					{
						env: this.env,
						toolCallId: `auto-low-balance-${crypto.randomUUID()}`,
					} as any
				);
				const success = Boolean((result as any)?.result?.success);
				if (success) {
					await this.ctx.storage.put(
						LOW_BALANCE_SUPPORT_LAST_REPORTED_AT_KEY,
						now
					);
					return;
				}
			}

			// Fallback to direct email if tool path is unavailable/fails.
			const resendKey = await getEnvVar(
				this.env as Record<string, unknown>,
				"RESEND_API_KEY",
				false
			);
			if (!resendKey?.trim()) {
				return;
			}
			const fromAddress =
				(await getEnvVar(
					this.env as Record<string, unknown>,
					"VERIFICATION_EMAIL_FROM",
					false
				)) || "LoreSmith <noreply@loresmith.ai>";
			const emailService = new EmailService(resendKey.trim());
			const emailResult = await emailService.sendSupportEmail({
				subject,
				body,
				fromAddress,
			});
			if (emailResult.ok) {
				await this.ctx.storage.put(
					LOW_BALANCE_SUPPORT_LAST_REPORTED_AT_KEY,
					now
				);
			}
		} catch (supportError) {
			console.error(
				`[${this.constructor.name}] Failed to auto-submit low-balance support issue:`,
				supportError
			);
		}
	}

	/**
	 * Creates a new BaseAgent instance.
	 *
	 * @param ctx - The Durable Object state for persistence
	 * @param env - The environment containing Cloudflare bindings (R2, Durable Objects, etc.)
	 * @param model - The AI model instance for generating responses
	 * @param tools - Collection of tools available to this agent
	 */
	constructor(
		ctx: DurableObjectState,
		env: Env,
		model: any,
		tools: Record<string, any>
	) {
		super(ctx, env);
		this.model = model;
		this.tools = tools;
		// systemPrompt is now stored in static agentMetadata
	}

	/**
	 * Optional hook for role-based tool filtering. When defined, the agent's tool
	 * set is filtered by the user's campaign role (e.g. GM vs player). Return the
	 * tools appropriate for the given role.
	 */
	protected getToolsForRole?(_role: CampaignRole | null): Record<string, any>;

	/**
	 * Override addMessage to store messages in database for persistent history
	 * Database storage happens asynchronously (fire-and-forget) to keep the method synchronous
	 */
	addMessage(message: ChatMessage): void {
		// Call parent to add to in-memory array
		super.addMessage(message);

		// Store message in database for persistent history (fire-and-forget)
		// Only store if we have environment and the message has content
		if (this.env && "DB" in this.env && this.env.DB) {
			// Fire and forget - don't await to keep method signature synchronous
			this.storeMessageToDatabase(message).catch((error) => {
				// Log but don't fail - message storage is non-critical
				console.error(
					`[${this.constructor.name}] Failed to store message to database:`,
					error
				);
			});
		}
	}

	/**
	 * Store a message to the database asynchronously
	 * Made protected so subclasses or this base class can persist messages
	 * without mutating the in-memory message array (e.g. for streamed replies).
	 */
	protected async storeMessageToDatabase(message: ChatMessage): Promise<void> {
		const content =
			typeof message.content === "string"
				? message.content
				: JSON.stringify(message.content);

		if (content.trim().length === 0) {
			return; // Skip empty messages
		}

		// Extract sessionId, username and campaignId from message data if available
		const messageData = (message as any).data as
			| { jwt?: string; campaignId?: string | null; sessionId?: string }
			| undefined;

		// Prefer an explicit sessionId from the client; fall back to durable object ID
		const sessionId =
			(messageData?.sessionId as string | undefined) ||
			this.ctx?.id?.toString() ||
			`session-${Date.now()}`;

		let username: string | null = null;
		if (messageData?.jwt) {
			try {
				// Try to extract username from JWT (JWT payload is base64url-encoded)
				const part = messageData.jwt.split(".")[1] || "";
				let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
				const pad = base64.length % 4;
				if (pad) base64 += "=".repeat(4 - pad);
				const jwtPayload = JSON.parse(atob(base64));
				username = jwtPayload.username || null;
			} catch (error) {
				console.warn(
					`[${this.constructor.name}] Failed to extract username from JWT:`,
					error
				);
			}
		}

		const daoFactory = getDAOFactory(this.env as unknown as { DB: any });
		await daoFactory.messageHistoryDAO.createMessage({
			sessionId,
			username,
			campaignId: messageData?.campaignId || null,
			role: message.role,
			content,
			messageData: messageData || null,
		});
	}

	/**
	 * Processes incoming chat messages and generates responses.
	 *
	 * This method handles the core chat functionality including:
	 * - JWT extraction from user messages for authentication
	 * - Message filtering to prevent incomplete tool invocation errors
	 * - Tool execution with enhanced authentication context
	 * - Streaming response generation
	 *
	 * @param onFinish - Callback function called when the response is complete
	 * @param _options - Optional configuration including abort signal
	 *
	 * @returns Promise that resolves when the response is complete
	 *
	 * @example
	 * ```typescript
	 * await agent.onChatMessage((response) => {
	 *   console.log('Response complete:', response);
	 * });
	 * ```
	 */
	async onChatMessage(
		onFinish: (message: any) => void | Promise<void>,
		_options?: { abortSignal?: AbortSignal }
	): Promise<Response> {
		const dataStreamResponse = createDataStreamResponse({
			execute: async (dataStream) => {
				const log = createLogger(
					this.env as Record<string, unknown>,
					`[${this.constructor.name}]`
				);
				const turnStartedAt = Date.now();

				// Extract JWT from the last user message if available
				const lastUserMessage = this.messages
					.slice()
					.reverse()
					.find((msg) => msg.role === "user");

				let clientJwt: string | null = null;
				let selectedCampaignId: string | null = null;
				if (
					lastUserMessage &&
					"data" in lastUserMessage &&
					lastUserMessage.data
				) {
					const messageData = lastUserMessage.data as MessageData & {
						campaignId?: string;
					};
					clientJwt = messageData.jwt || null;
					if (typeof messageData.campaignId === "string") {
						selectedCampaignId = messageData.campaignId;
					}
				}
				if (!selectedCampaignId) {
					// Fallback: use the most recent campaignId found in message metadata
					// (including client marker system messages) so tools can use the
					// active conversation campaign without asking the user for IDs.
					const recentCampaignMessage = this.messages
						.slice()
						.reverse()
						.find((msg) => {
							const data = (msg as { data?: unknown }).data as
								| { campaignId?: unknown }
								| undefined;
							return typeof data?.campaignId === "string";
						});
					if (recentCampaignMessage) {
						const data = (recentCampaignMessage as { data?: unknown }).data as {
							campaignId?: string;
						};
						selectedCampaignId = data.campaignId ?? null;
					}
				}

				// Resolve campaign role and build role context for GM vs player tailoring
				let claimedPlayerContext: Awaited<
					ReturnType<typeof resolveClaimedPlayerContext>
				> = null;
				let campaignRole: CampaignRole | null = null;
				if (selectedCampaignId && clientJwt) {
					claimedPlayerContext = await resolveClaimedPlayerContext(
						this.env,
						selectedCampaignId,
						clientJwt
					);
					campaignRole = claimedPlayerContext?.role ?? null;
					log.debug("Resolved campaign role", { campaignRole });
				}
				const roleContextMessage = getAgentRoleContext(claimedPlayerContext);

				// Player users must select a claimed character before campaign-specific generation.
				// Short-circuit this turn so we don't execute tools or call the LLM.
				if (campaignRole && PLAYER_ROLES.has(campaignRole)) {
					const hasClaimedEntity = !!claimedPlayerContext?.entity;
					const hasAnyPcEntities =
						claimedPlayerContext?.hasAnyPcEntities ?? false;
					const shouldShortCircuit =
						campaignRole === CAMPAIGN_ROLES.EDITOR_PLAYER &&
						!hasClaimedEntity &&
						hasAnyPcEntities;
					if (shouldShortCircuit) {
						writeTextChunks(dataStream.write, MISSING_PLAYER_CHARACTER_MESSAGE);

						try {
							const assistantData: {
								jwt?: string | null;
								campaignId?: string | null;
								sessionId?: string;
							} = {};
							if (clientJwt) assistantData.jwt = clientJwt;
							if (selectedCampaignId)
								assistantData.campaignId = selectedCampaignId;
							const sessionIdFromUser = (lastUserMessage as any)?.data
								?.sessionId;
							assistantData.sessionId =
								(typeof sessionIdFromUser === "string" &&
									sessionIdFromUser.length > 0 &&
									sessionIdFromUser) ||
								this.ctx?.id?.toString() ||
								`session-${Date.now()}`;

							const assistantMessage: ChatMessage = {
								role: "assistant",
								content: MISSING_PLAYER_CHARACTER_MESSAGE,
								data: assistantData,
							};
							if (this.env && "DB" in this.env && this.env.DB) {
								this.storeMessageToDatabase(assistantMessage).catch((error) => {
									console.error(
										`[${this.constructor.name}] Failed to store assistant message to database:`,
										error
									);
								});
							}
						} catch (persistError) {
							console.error(
								`[${this.constructor.name}] Error while persisting assistant message:`,
								persistError
							);
						}

						return;
					}
				}

				// Build message context: include recent conversation history so agents can answer
				// their own questions (e.g. campaign name/tone from prior messages) and understand
				// references ("these", "that", "try again"). Conversation is keyed by userId+campaignId.
				// Keep only user/assistant messages for Anthropic compatibility.

				const MAX_CONTEXT_MESSAGES = 20;

				const userAssistantMessages = this.messages.filter(
					(msg) => msg.role === "user" || msg.role === "assistant"
				);
				const recentMessages = userAssistantMessages.slice(
					-MAX_CONTEXT_MESSAGES
				);
				const processedMessages: typeof this.messages = [...recentMessages];
				const supplementalSystemContext: string[] = [];

				// Include role context so agents tailor for GM vs player.
				// Anthropic does not support interleaved system messages in history.
				if (roleContextMessage) {
					supplementalSystemContext.push(roleContextMessage);
				}

				// Include essential system messages (campaign context, user state) but exclude tool results
				for (let i = 0; i < this.messages.length; i++) {
					const message = this.messages[i];
					if (message.role === "system") {
						const content =
							typeof message.content === "string" ? message.content : "";
						// Only include essential system context, not tool results
						if (
							content.includes("Campaign Context:") ||
							content.includes("User State Analysis:") ||
							content.includes("User role in this campaign:")
						) {
							supplementalSystemContext.push(content);
						}
					}
				}

				// Inject resolved campaign rules context for targeted core agents.
				const agentType = ((this.constructor as any).agentMetadata?.type ||
					"") as string;
				if (
					selectedCampaignId &&
					RULES_AWARE_AGENT_TYPES.has(agentType) &&
					this.env &&
					"DB" in this.env &&
					this.env.DB
				) {
					try {
						const resolvedRules =
							await RulesContextService.getResolvedRulesContext(
								this.env,
								selectedCampaignId
							);
						supplementalSystemContext.push(
							RulesContextService.buildSystemContext(resolvedRules)
						);
					} catch (rulesError) {
						log.warn("Failed to inject campaign rules context", rulesError);
					}
				}

				log.debug("Built minimal message context", {
					totalMessages: this.messages.length,
					processedMessages: processedMessages.length,
				});

				// Determine whether the most recent user command is stale
				let isStaleCommand = false;
				try {
					const createdAt = (lastUserMessage as any)?.createdAt as
						| string
						| number
						| Date
						| undefined;
					if (createdAt) {
						const ts = new Date(createdAt as any).getTime();
						const ageMs = Date.now() - ts;
						// Consider commands older than 30 seconds as stale (guard to avoid re-triggering actions)
						isStaleCommand = Number.isFinite(ageMs) && ageMs > 30 * 1000;

						// If any newer system message exists after the user message, mark as stale
						try {
							const userTs = ts;
							const newerSystemExists = this.messages.some((m: any) => {
								if (m?.role !== "system" || !m?.createdAt) return false;
								const msTs = new Date(m.createdAt as any).getTime();
								return Number.isFinite(msTs) && msTs > userTs;
							});
							if (newerSystemExists) {
								isStaleCommand = true;
							}
						} catch (_e2) {}

						// If a client marker exists indicating this user message was processed, treat as stale
						try {
							const markerFound = this.messages.some((m: any) => {
								if (m?.role !== "system") return false;
								const data = (m as any)?.data;
								return (
									data &&
									data.type === "client_marker" &&
									data.processedMessageId === (lastUserMessage as any)?.id
								);
							});
							if (markerFound) {
								isStaleCommand = true;
							}
						} catch (_e3) {}
					}
				} catch (_e) {}

				// Resolve tool set: use role-filtered tools if agent defines getToolsForRole
				const getToolsForRole = (
					this as unknown as {
						getToolsForRole?: (r: CampaignRole | null) => Record<string, any>;
					}
				).getToolsForRole;
				const toolsToUse =
					typeof getToolsForRole === "function"
						? getToolsForRole(campaignRole)
						: this.tools;

				// Log when tools require campaignId but no explicit selection is available
				// This is a valid use case (e.g., user asks to delete a campaign by name without selecting it)
				const toolsRequiringCampaignId = Object.entries(toolsToUse).filter(
					([_, t]) => {
						const schema = (t as any).inputSchema ?? (t as any).parameters;
						const shape =
							schema &&
							typeof schema === "object" &&
							"shape" in schema &&
							(schema as any).shape;
						return !!shape && "campaignId" in shape;
					}
				);

				if (toolsRequiringCampaignId.length > 0 && !selectedCampaignId) {
					log.debug("No selected campaign ID, allowing inferred campaignId", {
						toolCount: toolsRequiringCampaignId.length,
					});
				}

				// Create enhanced tools with optional status callback for real-time "thinking" updates
				const onToolStart = (toolName: string) => {
					dataStream.write({
						type: "status",
						message: getStatusMessageForTool(toolName),
					});
				};
				const enhancedTools = this.createEnhancedTools(
					clientJwt,
					selectedCampaignId,
					{ isStaleCommand },
					toolsToUse,
					{ onToolStart },
					claimedPlayerContext
				);

				// Determine tool choice: use "auto" to allow the agent to call tools when needed
				// and generate a final text response after tool calls
				// The system prompt instructs the agent to use tools when appropriate
				const toolChoice =
					Object.keys(enhancedTools).length > 0 ? "auto" : "none";

				// Stream the AI response using the provided model

				// Estimate tokens for logging (no truncation - we rely on targeted graph traversal via tools)
				const systemPrompt = (this.constructor as any).agentMetadata
					.systemPrompt;
				const modelId = this.model?.modelId || "unknown";
				const contextLimit = getSafeContextLimit(modelId);
				const systemPromptTokens = estimateTokenCount(systemPrompt);
				const toolsTokens = estimateToolsTokens(enhancedTools);
				const estimatedTokens = estimateRequestTokens(
					systemPrompt,
					processedMessages,
					enhancedTools
				);

				log.debug("Token estimation", {
					estimatedTokens,
					contextLimit,
					systemPromptTokens,
					toolsTokens,
				});

				// If we're still over the limit with minimal context, log a warning
				// The LLM should use tools to fetch targeted context rather than including everything
				if (estimatedTokens > contextLimit) {
					log.warn(
						`Context still large (${estimatedTokens} > ${contextLimit}) even with minimal message history.`
					);
				}

				// Log request details for debugging
				const requestDetails = {
					agent: this.constructor.name,
					model: modelId,
					messageCount: processedMessages.length,
					toolCount: Object.keys(enhancedTools).length,
					toolNames: Object.keys(enhancedTools),
					toolChoice,
					estimatedTokens,
					contextLimit,
					lastUserMessage: processedMessages
						.slice()
						.reverse()
						.find((m: any) => m.role === "user")
						?.content?.slice(0, 100),
				};

				// Keep one compact structured summary per turn for production observability.
				log.info("Making LLM provider request", {
					agent: requestDetails.agent,
					model: requestDetails.model,
					messageCount: requestDetails.messageCount,
					toolCount: requestDetails.toolCount,
					toolNames: requestDetails.toolNames,
					toolChoice: requestDetails.toolChoice,
					lastUserMessage: requestDetails.lastUserMessage,
				});
				let lowBalanceSupportIssueSubmitted = false;

				let stepsResolve: (steps: any) => void;
				const stepsPromise = new Promise<any>((resolve) => {
					stepsResolve = resolve;
				});
				const STEPS_TIMEOUT_MS = 15_000;
				const stepsWithTimeout = Promise.race([
					stepsPromise,
					new Promise<any[]>((resolve) =>
						setTimeout(() => resolve([]), STEPS_TIMEOUT_MS)
					),
				]);

				try {
					const systemPrompt = (this.constructor as any).agentMetadata
						.systemPrompt;
					const mergedSystemPrompt =
						supplementalSystemContext.length > 0
							? `${systemPrompt}\n\n${supplementalSystemContext.join("\n\n")}`
							: systemPrompt;

					const result = streamText({
						model: this.model,
						system: mergedSystemPrompt,
						toolChoice, // Use the variable instead of hardcoded value
						messages: processedMessages,
						tools: enhancedTools,
						stopWhen: stepCountIs(MAX_AGENT_STEPS), // Allow multiple tool-call rounds until final text response
						onFinish: async (args) => {
							stepsResolve(args?.steps ?? []);
							const steps = args?.steps ?? [];
							const allToolCalls = steps.flatMap(
								(step: any) => step.toolCalls || []
							);
							log.info("LLM provider response complete", {
								finishReason: args?.finishReason ?? "unknown",
								stepCount: steps.length,
								toolCallCount: allToolCalls.length,
								toolNames: [
									...new Set(
										allToolCalls
											.map((call: any) => call?.toolName)
											.filter((name): name is string => !!name)
									),
								],
								durationMs: Date.now() - turnStartedAt,
							});
							// Record LLM usage for rate limiting (chat consumes quota)
							// Skip recording for help requests (exempt from limits)
							const lastUserData = lastUserMessage?.data as
								| { isHelpRequest?: boolean }
								| undefined;
							const isHelpRequest = lastUserData?.isHelpRequest === true;
							if (clientJwt && !isHelpRequest) {
								try {
									const part = clientJwt.split(".")[1] || "";
									let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
									const pad = base64.length % 4;
									if (pad) base64 += "=".repeat(4 - pad);
									const jwtPayload = JSON.parse(atob(base64));
									const username = jwtPayload.username;
									const usage = (args?.totalUsage ?? args?.usage) as
										| {
												totalTokens?: number;
												promptTokens?: number;
												completionTokens?: number;
										  }
										| undefined;
									if (username && usage) {
										const tokens =
											usage.totalTokens ??
											(usage.promptTokens ?? 0) + (usage.completionTokens ?? 0);
										if (tokens > 0 && this.env?.DB) {
											const rateLimitService = getLLMRateLimitService(
												this.env as Parameters<typeof getLLMRateLimitService>[0]
											);
											await rateLimitService.recordUsage(username, tokens, 1);
										}
									}
								} catch (err) {
									log.warn("Failed to record LLM usage", err);
								}
							}
							// Convert the finish args to ChatMessage format
							await (onFinish ?? (() => {}))(args);
						},
						onError: (errorObj) => {
							// Extract all error details
							const error = errorObj.error as Error & Record<string, any>;
							const errorMessage = error?.message || String(error);
							const errorDetails = {
								message: errorMessage,
								name: error?.name || "Unknown",
								// Provider error detail fields (vary by SDK/provider)
								statusCode: error?.statusCode,
								code: error?.code,
								type: error?.type,
								param: error?.param,
							};

							console.error(
								`[${this.constructor.name}] ❌ LLM provider call failed`
							);
							// Log compact request summary instead of full details to avoid log size limits
							console.error(
								`Request Summary:`,
								JSON.stringify({
									agent: requestDetails.agent,
									model: requestDetails.model,
									messageCount: requestDetails.messageCount,
									toolCount: requestDetails.toolCount,
									toolNames: requestDetails.toolNames,
								})
							);
							console.error(`Error:`, JSON.stringify(errorDetails));
							// Only log stack trace if it's a small error (not a large request issue)
							if (error?.stack && error.stack.length < 1000) {
								console.error(`Stack:`, error.stack);
							}

							// Detect quota/rate limit errors and provide helpful messaging
							const isQuotaError =
								errorMessage.includes("exceeded your current quota") ||
								errorMessage.includes("quota") ||
								errorMessage.includes("billing details") ||
								errorMessage.includes("insufficient_quota");
							const isRateLimitError =
								errorMessage.includes("rate limit") ||
								errorMessage.includes("429") ||
								errorMessage.includes("too many requests");
							const isLowBalanceError = isLowBalanceProviderError(errorMessage);

							// Detect context length errors
							const isContextLengthError =
								errorMessage.includes("maximum context length") ||
								errorMessage.includes("context length") ||
								errorMessage.includes("too many tokens") ||
								errorMessage.includes("reduce the length");

							// Send appropriate error message to user
							if (isLowBalanceError) {
								writeTextChunks(
									dataStream.write,
									TEMPORARY_UNAVAILABLE_MESSAGE
								);
								if (!lowBalanceSupportIssueSubmitted) {
									lowBalanceSupportIssueSubmitted = true;
									void this.submitLowBalanceSupportIssue({
										clientJwt,
										campaignId: selectedCampaignId,
										lastUserMessage: requestDetails.lastUserMessage || "",
										errorMessage,
									});
								}
							} else if (isQuotaError || isRateLimitError) {
								writeTextChunks(dataStream.write, RATE_LIMIT_UPSELL_MESSAGE);
							} else if (isContextLengthError) {
								writeTextChunks(
									dataStream.write,
									"I encountered an issue: the context retrieved from your campaign is too large for me to process. I've automatically trimmed the least relevant information, but the request still exceeds my capacity. Please try a more specific query to narrow down the results."
								);
							} else {
								writeTextChunks(
									dataStream.write,
									"I apologize, but I encountered an error while processing your request. Please try again."
								);
							}
						},
					});

					// Handle the result using textStream (emit SSE + UIMessageChunk format for useChat)
					if (result?.textStream) {
						dataStream.write({ type: "text-start", id: TEXT_PART_ID });
						let fullText = "";
						for await (const chunk of result.textStream) {
							let sanitizedChunk = sanitizeGeneratedAssistantText(chunk);
							// Repair sentence spacing across stream chunk boundaries:
							// if previous chunk ended with punctuation and this one starts with
							// an uppercase letter, insert a joining space.
							if (
								fullText.length > 0 &&
								sanitizedChunk.length > 0 &&
								/[.!?]$/.test(fullText) &&
								/^[A-Z]/.test(sanitizedChunk)
							) {
								sanitizedChunk = ` ${sanitizedChunk}`;
							}
							fullText += sanitizedChunk;
							dataStream.write({
								type: "text-delta",
								id: TEXT_PART_ID,
								delta: sanitizedChunk,
							});
						}
						dataStream.write({ type: "text-end", id: TEXT_PART_ID });

						// Build explainability from tool steps and attach to message data
						let explainability: Explainability | null = null;
						try {
							const steps = await stepsWithTimeout;
							explainability = buildExplainabilityFromSteps(steps);
						} catch (e) {
							log.warn("Failed to build explainability", e);
						}

						// Persist the assistant's final message to message history.
						try {
							const assistantData: {
								jwt?: string | null;
								campaignId?: string | null;
								sessionId?: string;
								explainability?: Explainability | null;
							} = {};
							if (clientJwt) {
								assistantData.jwt = clientJwt;
							}
							if (selectedCampaignId) {
								assistantData.campaignId = selectedCampaignId;
							}
							// Prefer client-provided sessionId when available; fall back to DO id.
							const sessionIdFromUser = (lastUserMessage as any)?.data
								?.sessionId;
							assistantData.sessionId =
								(typeof sessionIdFromUser === "string" &&
									sessionIdFromUser.length > 0 &&
									sessionIdFromUser) ||
								this.ctx?.id?.toString() ||
								`session-${Date.now()}`;

							if (explainability) {
								assistantData.explainability = explainability;
							}

							const assistantMessage: ChatMessage = {
								role: "assistant",
								content: fullText,
								data: assistantData,
							};

							// Fire-and-forget persistence; do not modify in-memory message array.
							if (this.env && "DB" in this.env && this.env.DB) {
								this.storeMessageToDatabase(assistantMessage).catch((error) => {
									console.error(
										`[${this.constructor.name}] Failed to store assistant message to database:`,
										error
									);
								});
							}
						} catch (persistError) {
							console.error(
								`[${this.constructor.name}] Error while persisting assistant message:`,
								persistError
							);
						}
					} else {
						log.warn("No textStream available, using fallback response");
						writeTextChunks(
							dataStream.write,
							"I'm here to help! What would you like to know about LoreSmith AI?"
						);
					}
				} catch (error) {
					console.error(
						`[${this.constructor.name}] Error in streamText:`,
						error
					);

					// Check if it's a context length error
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					const isLowBalanceError = isLowBalanceProviderError(errorMessage);
					const isContextLengthError =
						errorMessage.includes("maximum context length") ||
						errorMessage.includes("context length") ||
						errorMessage.includes("too many tokens") ||
						errorMessage.includes("reduce the length");

					// Write appropriate error message to dataStream
					if (isLowBalanceError) {
						writeTextChunks(dataStream.write, TEMPORARY_UNAVAILABLE_MESSAGE);
						if (!lowBalanceSupportIssueSubmitted) {
							lowBalanceSupportIssueSubmitted = true;
							await this.submitLowBalanceSupportIssue({
								clientJwt,
								campaignId: selectedCampaignId,
								lastUserMessage: requestDetails.lastUserMessage || "",
								errorMessage,
							});
						}
					} else if (isContextLengthError) {
						writeTextChunks(
							dataStream.write,
							"I encountered an issue: the context retrieved from your campaign is too large for me to process. I've automatically trimmed the least relevant information, but the request still exceeds my capacity. Please try a more specific query to narrow down the results."
						);
					} else {
						writeTextChunks(
							dataStream.write,
							"I apologize, but I encountered an error while processing your request. Please try again."
						);
					}
					throw error;
				}
			},
		});

		return dataStreamResponse;
	}

	/**
	 * Create enhanced tools that automatically include JWT for operations.
	 * @param toolsOverride - Optional tool set to use instead of this.tools (for role-based filtering)
	 */
	protected createEnhancedTools(
		clientJwt: string | null,
		selectedCampaignId: string | null,
		staleGuard?: { isStaleCommand?: boolean },
		toolsOverride?: Record<string, any>,
		options?: { onToolStart?: (toolName: string) => void },
		claimedPlayerContext?: ResolvedClaimedPlayerContext | null
	): Record<string, any> {
		const log = createLogger(
			this.env as Record<string, unknown>,
			`[${this.constructor.name}]`
		);
		const baseTools = toolsOverride ?? this.tools;
		const tools = {
			...baseTools,
			submitSupportRequest: submitSupportRequestTool,
		};
		// Track tool calls to prevent infinite loops
		const toolCallCounts = new Map<string, number>();

		return Object.fromEntries(
			Object.entries(tools).map(([toolName, tool]) => {
				return [
					toolName,
					{
						...tool,
						execute: async (args: any, context: any) => {
							options?.onToolStart?.(toolName);

							// Check for infinite loops
							const callKey = `${toolName}_${JSON.stringify(args)}`;
							const currentCount = toolCallCounts.get(callKey) || 0;
							if (currentCount > 2) {
								log.warn(
									`Tool ${toolName} called ${currentCount} times, preventing infinite loop`
								);
								return {
									toolCallId: context?.toolCallId || "unknown",
									result: {
										success: false,
										message: `Tool ${toolName} called too many times, stopping to prevent infinite loop`,
										data: null,
									},
								};
							}
							toolCallCounts.set(callKey, currentCount + 1);

							// Ensure JWT is always included for operations that require it
							const enhancedArgs = { ...args };

							// Resolve schema for param checks: AI SDK v5 uses .parameters, v6 uses .inputSchema (Zod has .shape)
							const schema =
								(tool as any).inputSchema ?? (tool as any).parameters;
							const shape =
								schema &&
								typeof schema === "object" &&
								"shape" in schema &&
								(schema as any).shape;

							const hasJwtParam = !!shape && "jwt" in shape;
							if (hasJwtParam) {
								// Always use client JWT when available; never trust LLM-provided jwt (often invalid/placeholder)
								if (clientJwt) {
									enhancedArgs.jwt = clientJwt;
								} else if (!("jwt" in enhancedArgs)) {
									enhancedArgs.jwt = null;
								}
							}

							const hasCampaignIdParam = !!shape && "campaignId" in shape;
							if (hasCampaignIdParam && selectedCampaignId) {
								// Always use the selectedCampaignId from the current message, overriding any LLM-provided value
								const previousCampaignId = enhancedArgs.campaignId;
								enhancedArgs.campaignId = selectedCampaignId;
								if (
									previousCampaignId &&
									previousCampaignId !== selectedCampaignId
								) {
									log.debug(
										"Overriding inferred campaignId with selected campaign",
										{
											toolName,
										}
									);
								}
							}

							const hasSessionIdParam = !!shape && "sessionId" in shape;

							if (hasSessionIdParam && !enhancedArgs.sessionId) {
								// Inject sessionId from durable object ID
								const sessionId = this.ctx.id.toString();
								enhancedArgs.sessionId = sessionId;
							}

							const claimedEntity = claimedPlayerContext?.entity;
							if (claimedEntity && shape) {
								if ("playerCharacterEntityId" in shape) {
									enhancedArgs.playerCharacterEntityId = claimedEntity.id;
								}
								if ("claimedEntityId" in shape) {
									enhancedArgs.claimedEntityId = claimedEntity.id;
								}
								if ("playerCharacterName" in shape) {
									enhancedArgs.playerCharacterName = claimedEntity.name;
								}
							}

							// Pass sessionId and env in context for tools that need it (will be merged with existing enhancedContext below)
							// Handle test environments where ctx.id might not exist
							const sessionContext = {
								sessionId: this.ctx?.id?.toString() || `session-${Date.now()}`,
							};

							if (hasCampaignIdParam && !selectedCampaignId) {
								// Valid use case: User may not have a campaign selected but wants to interact with a specific campaign.
								// In this case, we allow the LLM to infer the campaign ID from the user's request.
								log.debug("No selected campaign ID for tool execution", {
									toolName,
								});
							}

							// Block mutating tools if the last user command is stale
							// Note: Legacy shard tools removed - entity approval/rejection now handled via API routes
							const mutatingTools = new Set([
								"createShardsTool", // Keep for backward compatibility if still used
							]);
							if (staleGuard?.isStaleCommand && mutatingTools.has(toolName)) {
								log.warn(
									`Blocking mutating tool '${toolName}' due to stale user command`
								);
								return {
									toolCallId: context?.toolCallId || "unknown",
									result: {
										success: false,
										message:
											"IGNORED_STALE_COMMAND: Mutating action was blocked because the originating user command is stale.",
										data: null,
									},
								};
							}

							if (!tool.execute) {
								log.warn(`Tool ${toolName} has no execute function`);
								return {
									toolCallId: context?.toolCallId || "unknown",
									result: {
										success: false,
										message: `Tool ${toolName} is not executable`,
										data: null,
									},
								};
							}

							// Pass environment and sessionId to tools that need it
							const enhancedContext = {
								...context,
								env: this.env,
								...sessionContext,
								playerCharacter: claimedPlayerContext
									? {
											username: claimedPlayerContext.username,
											role: claimedPlayerContext.role,
											claim: claimedPlayerContext.claim,
											entity: claimedPlayerContext.entity,
										}
									: null,
							};
							const toolResult = await tool.execute(
								enhancedArgs,
								enhancedContext
							);
							log.debug("Tool executed", { toolName });

							// Trim tool results by relevancy if they're too large
							// This prevents token overflow by keeping highest priority items
							let trimmedResult = toolResult;
							try {
								const modelId =
									this.model?.modelId ||
									getGenerationModelForProvider("SESSION_PLANNING");
								const contextLimit = getSafeContextLimit(modelId);

								// Use a conservative limit for tool results: 30% of context limit
								// This leaves room for system prompt, tools, messages, and response generation
								const maxToolResultTokens = Math.floor(contextLimit * 0.3);

								if (maxToolResultTokens > 0) {
									trimmedResult = await trimToolResultsByRelevancy(
										toolResult,
										maxToolResultTokens,
										this.env,
										selectedCampaignId
									);
								}
							} catch (trimError) {
								log.warn("Failed to trim tool result", trimError);
								// Continue with original result if trimming fails
							}

							// Normalize results from ai.tool() to the expected ToolResult envelope
							const normalized = (() => {
								// If already in the expected envelope, use trimmed result so LLM gets trimmed content
								if (
									trimmedResult &&
									typeof trimmedResult === "object" &&
									"toolCallId" in trimmedResult &&
									"result" in trimmedResult
								) {
									return trimmedResult as any;
								}
								if (
									toolResult &&
									typeof toolResult === "object" &&
									"toolCallId" in toolResult &&
									"result" in toolResult
								) {
									return toolResult as any;
								}

								// Wrap plain results (use trimmed result)
								const resultToWrap = trimmedResult;
								const success =
									resultToWrap &&
									typeof resultToWrap === "object" &&
									"success" in resultToWrap
										? (resultToWrap as any).success
										: true;
								const message =
									resultToWrap &&
									typeof resultToWrap === "object" &&
									"message" in resultToWrap
										? (resultToWrap as any).message
										: "ok";
								const data =
									resultToWrap &&
									typeof resultToWrap === "object" &&
									"data" in resultToWrap
										? (resultToWrap as any).data
										: resultToWrap;

								return {
									toolCallId: enhancedContext?.toolCallId || "unknown",
									result: { success, message, data },
								};
							})();

							return normalized;
						},
					},
				];
			})
		);
	}
}
