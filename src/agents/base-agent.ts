import { formatDataStreamPart } from "@ai-sdk/ui-utils";
import { streamText } from "ai";
import { SimpleChatAgent, type ChatMessage } from "./simple-chat-agent";
import {
  estimateRequestTokens,
  estimateTokenCount,
  estimateToolsTokens,
  getSafeContextLimit,
} from "@/lib/token-utils";
import { getDAOFactory } from "@/dao/dao-factory";
import { trimToolResultsByRelevancy } from "@/lib/tool-result-trimming";

interface Env {
  ADMIN_SECRET?: string;
  Chat: DurableObjectNamespace;
  [key: string]: unknown;
}

interface MessageData {
  jwt?: string;
}

function createDataStreamResponse(options: {
  execute: (dataStream: { write: (chunk: unknown) => void }) => Promise<void>;
}): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const dataStream = {
        write(chunk: unknown) {
          const text =
            typeof chunk === "string" ? chunk : JSON.stringify(chunk);
          controller.enqueue(encoder.encode(text));
        },
      };

      try {
        await options.execute(dataStream);
      } finally {
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
   */
  private async storeMessageToDatabase(message: ChatMessage): Promise<void> {
    const content =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);

    if (content.trim().length === 0) {
      return; // Skip empty messages
    }

    // Get session ID from durable object ID
    // Handle test environments where ctx.id might not exist
    const sessionId = this.ctx?.id?.toString() || `session-${Date.now()}`;

    // Extract username and campaignId from message data if available
    const messageData = (message as any).data as
      | { jwt?: string; campaignId?: string | null }
      | undefined;

    let username: string | null = null;
    if (messageData?.jwt) {
      try {
        // Try to extract username from JWT
        const jwtPayload = JSON.parse(
          atob(messageData.jwt.split(".")[1] || "")
        );
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
        // Extract JWT from the last user message if available
        const lastUserMessage = this.messages
          .slice()
          .reverse()
          .find((msg) => msg.role === "user");

        console.log(
          `[${this.constructor.name}] Last user message:`,
          lastUserMessage
        );
        console.log(
          `[${this.constructor.name}] Last user message keys:`,
          lastUserMessage ? Object.keys(lastUserMessage) : "no message"
        );
        console.log(
          `[${this.constructor.name}] Last user message has data property:`,
          lastUserMessage && "data" in lastUserMessage
        );
        console.log(
          `[${this.constructor.name}] Last user message data value:`,
          lastUserMessage && "data" in lastUserMessage
            ? lastUserMessage.data
            : "no data"
        );

        let clientJwt: string | null = null;
        let selectedCampaignId: string | null = null;
        if (
          lastUserMessage &&
          "data" in lastUserMessage &&
          lastUserMessage.data
        ) {
          console.log(
            `[${this.constructor.name}] lastUserMessage.data:`,
            lastUserMessage.data
          );
          const messageData = lastUserMessage.data as MessageData & {
            campaignId?: string;
          };
          clientJwt = messageData.jwt || null;
          if (typeof messageData.campaignId === "string") {
            selectedCampaignId = messageData.campaignId;
            console.log(
              `[${this.constructor.name}] Extracted campaignId from user message:`,
              selectedCampaignId
            );
          } else {
            console.log(
              `[${this.constructor.name}] No campaignId in user message data (value: ${messageData.campaignId}, type: ${typeof messageData.campaignId})`
            );
          }
          console.log(
            `[${this.constructor.name}] Extracted JWT from user message:`,
            clientJwt
          );
        } else {
          console.log(
            `[${this.constructor.name}] No JWT found in user message data.`
          );
        }

        console.log(
          `[${this.constructor.name}] Final selectedCampaignId for this request:`,
          selectedCampaignId
        );

        // Build minimal message context: include current user prompt + agent's previous response
        // The agent's previous response is included so it can understand conversational references
        // (e.g., "these", "that", "the name suggestions" referring to what the agent just said)
        // All older historical context is stored in the database and can be retrieved via getMessageHistory tool
        // This ensures targeted graph traversal - the LLM fetches only what it needs

        // Find the current user message (most recent user message)
        const currentUserMessage = this.messages
          .slice()
          .reverse()
          .find((msg) => msg.role === "user");

        // Find the agent's most recent response (to understand conversational references)
        const lastAssistantMessage = this.messages
          .slice()
          .reverse()
          .find((msg) => msg.role === "assistant");

        // Build minimal context: current user prompt + agent's previous response
        // The LLM can use getMessageHistory tool to fetch older history if needed
        const processedMessages: typeof this.messages = [];

        // Include agent's previous response first (if exists) so it can understand references
        if (
          lastAssistantMessage &&
          lastAssistantMessage !== currentUserMessage
        ) {
          processedMessages.push(lastAssistantMessage);
        }

        // Include current user message
        if (currentUserMessage) {
          processedMessages.push(currentUserMessage);
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
              content.includes("User State Analysis:")
            ) {
              // Only add if not already in processedMessages
              if (!processedMessages.some((m) => m === message)) {
                processedMessages.push(message);
              }
            }
          }
        }

        console.log(
          `[${this.constructor.name}] Built minimal message context: ${this.messages.length} total -> ${processedMessages.length} messages (current user prompt + agent's previous response + essential system messages). Historical context available via getMessageHistory tool.`
        );

        // Debug: Log available tools
        console.log(
          `[${this.constructor.name}] Available tools:`,
          Object.keys(this.tools)
        );
        if (lastUserMessage) {
          const userContent =
            typeof lastUserMessage.content === "string"
              ? lastUserMessage.content
              : JSON.stringify(lastUserMessage.content);
          console.log(
            `[${this.constructor.name}] User message content:`,
            userContent
          );
        }
        console.log(
          `[${this.constructor.name}] About to call streamText with maxSteps: 2...`
        );

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

        // Log when tools require campaignId but no explicit selection is available
        // This is a valid use case (e.g., user asks to delete a campaign by name without selecting it)
        const toolsRequiringCampaignId = Object.entries(this.tools).filter(
          ([_, tool]) => {
            return (
              tool.parameters &&
              typeof tool.parameters === "object" &&
              (tool.parameters as any).shape &&
              "campaignId" in (tool.parameters as any).shape
            );
          }
        );

        if (toolsRequiringCampaignId.length > 0 && !selectedCampaignId) {
          console.log(
            `[${this.constructor.name}] No selectedCampaignId available. ${toolsRequiringCampaignId.length} tool(s) will use LLM-inferred campaignId: ${toolsRequiringCampaignId.map(([name]) => name).join(", ")}`
          );
        }

        // Create enhanced tools that automatically include JWT and apply stale-command guard
        const enhancedTools = this.createEnhancedTools(
          clientJwt,
          selectedCampaignId,
          { isStaleCommand }
        );

        // Determine tool choice: use "auto" to allow the agent to call tools when needed
        // and generate a final text response after tool calls
        // The system prompt instructs the agent to use tools when appropriate
        const toolChoice =
          Object.keys(enhancedTools).length > 0 ? "auto" : "none";

        // Stream the AI response using the provided model
        console.log(
          `[${this.constructor.name}] Starting streamText with toolChoice: ${toolChoice}`
        );
        // Debug which tools will be available to the model (names only)
        try {
          const toolNames = Object.keys(enhancedTools);
          console.log(
            `[${this.constructor.name}] Enhanced tools exposed to model:`,
            toolNames
          );
        } catch (_e) {}
        console.log(`[${this.constructor.name}] Model: ${this.model}`);
        console.log(
          `[${this.constructor.name}] System prompt length: ${(this.constructor as any).agentMetadata.systemPrompt.length}`
        );
        console.log(
          `[${this.constructor.name}] Processed messages count: ${processedMessages.length}`
        );
        console.log(
          `[${this.constructor.name}] Enhanced tools count: ${Object.keys(enhancedTools).length}`
        );

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

        console.log(
          `[${this.constructor.name}] Token estimation: ${estimatedTokens} tokens (limit: ${contextLimit}, system: ${systemPromptTokens}, tools: ${toolsTokens})`
        );

        // If we're still over the limit with minimal context, log a warning
        // The LLM should use tools to fetch targeted context rather than including everything
        if (estimatedTokens > contextLimit) {
          console.warn(
            `[${this.constructor.name}] ⚠️ Context still large (${estimatedTokens} > ${contextLimit}) even with minimal message history. The LLM should use tools for targeted graph traversal to fetch only relevant context.`
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

        // Log compact request summary to avoid log size limits
        console.log(
          `[${this.constructor.name}] 🚀 Making OpenAI API request:`,
          JSON.stringify({
            agent: requestDetails.agent,
            model: requestDetails.model,
            messageCount: requestDetails.messageCount,
            toolCount: requestDetails.toolCount,
            toolNames: requestDetails.toolNames,
            toolChoice: requestDetails.toolChoice,
            lastUserMessage: requestDetails.lastUserMessage,
          })
        );

        try {
          const result = streamText({
            model: this.model,
            system: (this.constructor as any).agentMetadata.systemPrompt,
            toolChoice, // Use the variable instead of hardcoded value
            messages: processedMessages,
            tools: enhancedTools,
            onFinish: async (args) => {
              console.log(
                `[${this.constructor.name}] onFinish called with finishReason: ${args.finishReason}`
              );
              console.log(
                `[${this.constructor.name}] onFinish steps count: ${args.steps?.length || 0}`
              );
              // Log tool calls for debugging
              if (args.steps) {
                const allToolCalls = args.steps.flatMap(
                  (step) => step.toolCalls || []
                );
                if (allToolCalls.length > 0) {
                  console.log(
                    `[${this.constructor.name}] Tools called: ${allToolCalls.map((call) => call.toolName).join(", ")}`
                  );
                  const searchCalls = allToolCalls.filter(
                    (call) => call.toolName === "searchCampaignContext"
                  );
                  if (searchCalls.length > 0) {
                    searchCalls.forEach((call, idx) => {
                      console.log(
                        `[${this.constructor.name}] searchCampaignContext call ${
                          idx + 1
                        }: query="${(call as any).args?.query || "MISSING"}"`
                      );
                    });
                  }
                } else {
                  // This should not happen with toolChoice: "required", but log it if it does
                  console.warn(
                    `[${this.constructor.name}] ⚠️ WARNING: No tools were called despite toolChoice: "required". This may indicate an issue with the LLM or tool configuration.`
                  );
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
                // OpenAI specific fields
                statusCode: error?.statusCode,
                code: error?.code,
                type: error?.type,
                param: error?.param,
              };

              console.error(
                `[${this.constructor.name}] ❌ OpenAI API Call Failed`
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

              // Detect quota errors and provide helpful messaging
              const isQuotaError =
                errorMessage.includes("exceeded your current quota") ||
                errorMessage.includes("quota") ||
                errorMessage.includes("billing details") ||
                errorMessage.includes("insufficient_quota");

              // Detect context length errors
              const isContextLengthError =
                errorMessage.includes("maximum context length") ||
                errorMessage.includes("context length") ||
                errorMessage.includes("too many tokens") ||
                errorMessage.includes("reduce the length");

              // Send appropriate error message to user
              if (isQuotaError) {
                dataStream.write(
                  formatDataStreamPart(
                    "text",
                    "I'm unable to process your request because your OpenAI API quota has been exceeded. If you've recently updated your billing, it may take a few minutes for the changes to take effect. Please wait 2-3 minutes and try again, or check your OpenAI billing settings at https://platform.openai.com/account/billing"
                  )
                );
              } else if (isContextLengthError) {
                dataStream.write(
                  formatDataStreamPart(
                    "text",
                    "I encountered an issue: the context retrieved from your campaign is too large for me to process. I've automatically trimmed the least relevant information, but the request still exceeds my capacity. Please try a more specific query to narrow down the results."
                  )
                );
              } else {
                dataStream.write(
                  formatDataStreamPart(
                    "text",
                    "I apologize, but I encountered an error while processing your request. Please try again."
                  )
                );
              }
            },
          });

          console.log(
            `[${this.constructor.name}] streamText returned result:`,
            typeof result
          );

          // Handle the result using textStream
          if (result?.textStream) {
            console.log(
              `[${this.constructor.name}] Using textStream for response`
            );

            let fullText = "";
            for await (const chunk of result.textStream) {
              fullText += chunk;
              // Write each chunk to the data stream
              dataStream.write(formatDataStreamPart("text", chunk));
            }

            console.log(
              `[${this.constructor.name}] Completed streaming response:`,
              `${fullText.substring(0, 100)}...`
            );
          } else {
            console.log(
              `[${this.constructor.name}] No textStream available, using fallback`
            );
            // Fallback response
            dataStream.write(
              formatDataStreamPart(
                "text",
                "I'm here to help! What would you like to know about LoreSmith AI?"
              )
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
          const isContextLengthError =
            errorMessage.includes("maximum context length") ||
            errorMessage.includes("context length") ||
            errorMessage.includes("too many tokens") ||
            errorMessage.includes("reduce the length");

          // Write appropriate error message to dataStream
          if (isContextLengthError) {
            dataStream.write(
              formatDataStreamPart(
                "text",
                "I encountered an issue: the context retrieved from your campaign is too large for me to process. I've automatically trimmed the least relevant information, but the request still exceeds my capacity. Please try a more specific query to narrow down the results."
              )
            );
          } else {
            dataStream.write(
              formatDataStreamPart(
                "text",
                "I apologize, but I encountered an error while processing your request. Please try again."
              )
            );
          }
          throw error;
        }
      },
    });

    return dataStreamResponse;
  }

  /**
   * Create enhanced tools that automatically include JWT for operations
   */
  protected createEnhancedTools(
    clientJwt: string | null,
    selectedCampaignId: string | null,
    staleGuard?: { isStaleCommand?: boolean }
  ): Record<string, any> {
    // Track tool calls to prevent infinite loops
    const toolCallCounts = new Map<string, number>();

    return Object.fromEntries(
      Object.entries(this.tools).map(([toolName, tool]) => {
        console.log(`[${this.constructor.name}] Adding tool ${toolName}`);
        return [
          toolName,
          {
            ...tool,
            execute: async (args: any, context: any) => {
              // Check for infinite loops
              const callKey = `${toolName}_${JSON.stringify(args)}`;
              const currentCount = toolCallCounts.get(callKey) || 0;
              if (currentCount > 2) {
                console.warn(
                  `[${this.constructor.name}] Tool ${toolName} called ${currentCount} times, preventing infinite loop`
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

              // Check if the tool requires a JWT parameter and inject it if not provided
              // For Zod schemas, we need to check the shape property
              const hasJwtParam =
                tool.parameters &&
                typeof tool.parameters === "object" &&
                (tool.parameters as any).shape &&
                "jwt" in (tool.parameters as any).shape;

              if (hasJwtParam && !enhancedArgs.jwt) {
                enhancedArgs.jwt = clientJwt;
                console.log(
                  `[${this.constructor.name}] Injected JWT into tool ${toolName} parameters`
                );
              }

              // Check if the tool requires a campaignId parameter and inject/override it with the current campaign
              const hasCampaignIdParam =
                tool.parameters &&
                typeof tool.parameters === "object" &&
                (tool.parameters as any).shape &&
                "campaignId" in (tool.parameters as any).shape;

              if (hasCampaignIdParam && selectedCampaignId) {
                // Always use the selectedCampaignId from the current message, overriding any LLM-provided value
                // This ensures we use the campaign the user has explicitly selected in the dropdown
                const previousCampaignId = enhancedArgs.campaignId;
                enhancedArgs.campaignId = selectedCampaignId;
                if (
                  previousCampaignId &&
                  previousCampaignId !== selectedCampaignId
                ) {
                  console.log(
                    `[${this.constructor.name}] Overriding LLM-provided campaignId (${previousCampaignId}) with selectedCampaignId (${selectedCampaignId}) for tool ${toolName}`
                  );
                }
              }

              // Check if the tool requires a sessionId parameter and inject it from durable object ID
              const hasSessionIdParam =
                tool.parameters &&
                typeof tool.parameters === "object" &&
                (tool.parameters as any).shape &&
                "sessionId" in (tool.parameters as any).shape;

              if (hasSessionIdParam && !enhancedArgs.sessionId) {
                // Inject sessionId from durable object ID
                const sessionId = this.ctx.id.toString();
                enhancedArgs.sessionId = sessionId;
                console.log(
                  `[${this.constructor.name}] Injected sessionId into tool ${toolName} parameters: ${sessionId}`
                );
              }

              // Pass sessionId and env in context for tools that need it (will be merged with existing enhancedContext below)
              // Handle test environments where ctx.id might not exist
              const sessionContext = {
                sessionId: this.ctx?.id?.toString() || `session-${Date.now()}`,
              };

              if (hasCampaignIdParam && !selectedCampaignId) {
                // Valid use case: User may not have a campaign selected but wants to interact with a specific campaign.
                // In this case, we allow the LLM to infer the campaign ID from the user's request.
                console.log(
                  `[${this.constructor.name}] No selectedCampaignId available for tool ${toolName}. Using LLM-provided campaignId: ${enhancedArgs.campaignId}`
                );
              }

              // Block mutating tools if the last user command is stale
              // Note: Legacy shard tools removed - entity approval/rejection now handled via API routes
              const mutatingTools = new Set([
                "createShardsTool", // Keep for backward compatibility if still used
              ]);
              if (staleGuard?.isStaleCommand && mutatingTools.has(toolName)) {
                console.warn(
                  `[${this.constructor.name}] Blocking mutating tool '${toolName}' due to stale user command`
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

              // Execute the tool
              console.log(
                `[${this.constructor.name}] About to execute tool ${toolName}`
              );

              // Pass environment and sessionId to tools that need it
              const enhancedContext = {
                ...context,
                env: this.env,
                ...sessionContext,
              };
              const toolResult = await tool.execute(
                enhancedArgs,
                enhancedContext
              );

              console.log(
                `[${this.constructor.name}] Tool ${toolName} result: ${JSON.stringify(toolResult).substring(0, 200)}...`
              );

              // Trim tool results by relevancy if they're too large
              // This prevents token overflow by keeping highest priority items
              let trimmedResult = toolResult;
              try {
                const modelId = this.model?.modelId || "gpt-4o";
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

                  const originalTokens = estimateTokenCount(
                    JSON.stringify(toolResult)
                  );
                  const trimmedTokens = estimateTokenCount(
                    JSON.stringify(trimmedResult)
                  );
                  if (trimmedTokens < originalTokens) {
                    console.log(
                      `[${this.constructor.name}] Trimmed tool ${toolName} result: ${originalTokens} -> ${trimmedTokens} tokens (limit: ${maxToolResultTokens})`
                    );
                  }
                }
              } catch (trimError) {
                console.warn(
                  `[${this.constructor.name}] Failed to trim tool result:`,
                  trimError
                );
                // Continue with original result if trimming fails
              }

              // Add delay to prevent rate limiting
              await new Promise((resolve) => setTimeout(resolve, 100));

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
