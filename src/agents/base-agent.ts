import { formatDataStreamPart } from "@ai-sdk/ui-utils";
import {
  createDataStreamResponse,
  type StreamTextOnFinishCallback,
  streamText,
  type ToolSet,
} from "ai";
import { SimpleChatAgent } from "./simple-chat-agent";

interface Env {
  ADMIN_SECRET?: string;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
}

interface MessageData {
  jwt?: string;
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
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
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
        let campaignIdHint: string | null = null;
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
            campaignIdHint = messageData.campaignId;
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

        // Filter out messages with incomplete tool invocations to prevent conversion errors
        const processedMessages = this.messages.filter((message) => {
          // If the message has tool invocations, check if they're all complete
          if (message.toolInvocations && message.toolInvocations.length > 0) {
            return message.toolInvocations.every(
              (invocation: any) =>
                invocation.state === "result" && invocation.result !== undefined
            );
          }
          return true;
        });

        console.log(
          `[${this.constructor.name}] Filtered messages from ${this.messages.length} to ${processedMessages.length}`
        );

        // Debug: Log available tools
        console.log(
          `[${this.constructor.name}] Available tools:`,
          Object.keys(this.tools)
        );
        if (lastUserMessage) {
          console.log(
            `[${this.constructor.name}] User message content:`,
            lastUserMessage.content
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

        // Create enhanced tools that automatically include JWT and apply stale-command guard
        const enhancedTools = this.createEnhancedTools(
          clientJwt,
          campaignIdHint,
          { isStaleCommand }
        );

        // Use tools if available, otherwise use none
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

        try {
          const result = streamText({
            model: this.model,
            system: (this.constructor as any).agentMetadata.systemPrompt,
            toolChoice, // Use the variable instead of hardcoded value
            messages: processedMessages,
            tools: enhancedTools,
            maxSteps: 5, // Allow multiple steps including final response
            onFinish: async (args) => {
              console.log(
                `[${this.constructor.name}] onFinish called with finishReason: ${args.finishReason}`
              );
              console.log(
                `[${this.constructor.name}] onFinish steps count: ${args.steps?.length || 0}`
              );
              (onFinish ?? (() => {}))(
                args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
              );
            },
            onError: (error) => {
              console.error(
                `Error in ${this.constructor.name} streamText:`,
                error
              );
              // Send error message to user
              dataStream.write(
                formatDataStreamPart(
                  "text",
                  "I apologize, but I encountered an error while processing your request. Please try again."
                )
              );
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
          // Write error message to dataStream
          dataStream.write(
            formatDataStreamPart(
              "text",
              "I apologize, but I encountered an error while processing your request. Please try again."
            )
          );
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
    _campaignIdHint: string | null,
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
              if (
                tool.parameters &&
                typeof tool.parameters === "object" &&
                "jwt" in tool.parameters &&
                !enhancedArgs.jwt
              ) {
                enhancedArgs.jwt = clientJwt;
                console.log(
                  `[${this.constructor.name}] Injected JWT into tool ${toolName} parameters`
                );
              }

              // Block mutating tools if the last user command is stale
              const mutatingTools = new Set([
                "approveShardsTool",
                "rejectShardsTool",
                "createShardsTool",
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

              // Pass environment to tools that need it
              const enhancedContext = { ...context, env: this.env };
              const toolResult = await tool.execute(
                enhancedArgs,
                enhancedContext
              );

              console.log(
                `[${this.constructor.name}] Tool ${toolName} result: ${JSON.stringify(toolResult).substring(0, 200)}...`
              );

              // Add delay to prevent rate limiting
              await new Promise((resolve) => setTimeout(resolve, 100));

              // Normalize results from ai.tool() to the expected ToolResult envelope
              const normalized = (() => {
                // If already in the expected envelope, pass-through
                if (
                  toolResult &&
                  typeof toolResult === "object" &&
                  "toolCallId" in toolResult &&
                  "result" in toolResult
                ) {
                  return toolResult as any;
                }

                // Wrap plain results
                const success =
                  toolResult &&
                  typeof toolResult === "object" &&
                  "success" in toolResult
                    ? (toolResult as any).success
                    : true;
                const message =
                  toolResult &&
                  typeof toolResult === "object" &&
                  "message" in toolResult
                    ? (toolResult as any).message
                    : "ok";
                const data =
                  toolResult &&
                  typeof toolResult === "object" &&
                  "data" in toolResult
                    ? (toolResult as any).data
                    : toolResult;

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
