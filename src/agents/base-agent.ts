import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  type StreamTextOnFinishCallback,
  streamText,
  type ToolSet,
} from "ai";

interface Env {
  ADMIN_SECRET?: string;
  PDF_BUCKET: R2Bucket;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  CampaignManager: DurableObjectNamespace;
}

interface MessageData {
  jwt?: string;
}

/**
 * Abstract base agent class that provides common functionality for specialized agents
 */
export abstract class BaseAgent extends AIChatAgent<Env> {
  protected model: any;
  protected tools: Record<string, any>;
  protected systemPrompt: string;

  constructor(
    ctx: DurableObjectState,
    env: Env,
    model: any,
    tools: Record<string, any>,
    systemPrompt: string
  ) {
    super(ctx, env);
    this.model = model;
    this.tools = tools;
    this.systemPrompt = systemPrompt;
  }

  /**
   * Common implementation of onChatMessage that all specialized agents can use
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
        if (
          lastUserMessage &&
          "data" in lastUserMessage &&
          lastUserMessage.data
        ) {
          console.log(
            `[${this.constructor.name}] lastUserMessage.data:`,
            lastUserMessage.data
          );
          const messageData = lastUserMessage.data as MessageData;
          clientJwt = messageData.jwt || null;
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
              (invocation) =>
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

        // Create enhanced tools that automatically include JWT
        const enhancedTools = this.createEnhancedTools(clientJwt);

        // Stream the AI response using the provided model
        console.log(
          `[${this.constructor.name}] Starting streamText with toolChoice: required`
        );
        console.log(`[${this.constructor.name}] Model:`, this.model);
        console.log(
          `[${this.constructor.name}] System prompt length:`,
          this.systemPrompt.length
        );
        console.log(
          `[${this.constructor.name}] Processed messages count:`,
          processedMessages.length
        );
        console.log(
          `[${this.constructor.name}] Enhanced tools count:`,
          Object.keys(enhancedTools).length
        );

        try {
          const result = streamText({
            model: this.model,
            system: this.systemPrompt,
            toolChoice: "auto", // Allow the model to choose whether to use tools or respond directly
            messages: processedMessages,
            tools: enhancedTools,
            onFinish: async (args) => {
              console.log(
                `[${this.constructor.name}] onFinish called with args:`,
                args
              );
              (onFinish ?? (() => {}))(
                args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
              );
            },
            onError: (error) => {
              console.error(
                `Error while streaming in ${this.constructor.name}:`,
                error
              );
            },
            maxSteps: 1, // Allow one step (either tool call or direct response)
          });

          console.log(
            `[${this.constructor.name}] streamText returned result:`,
            typeof result
          );

          // Merge the AI response stream with tool execution outputs
          if (
            result &&
            typeof (
              result as { mergeIntoDataStream?: (dataStream: unknown) => void }
            ).mergeIntoDataStream === "function"
          ) {
            console.log(
              `[${this.constructor.name}] Merging result into dataStream`
            );
            (
              result as { mergeIntoDataStream: (dataStream: unknown) => void }
            ).mergeIntoDataStream(dataStream);
          } else {
            console.log(
              `[${this.constructor.name}] No mergeIntoDataStream function found on result`
            );
          }
        } catch (error) {
          console.error(
            `[${this.constructor.name}] Error in streamText:`,
            error
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
  protected createEnhancedTools(clientJwt: string | null): Record<string, any> {
    return Object.fromEntries(
      Object.entries(this.tools).map(([toolName, tool]) => {
        console.log(`[${this.constructor.name}] Adding tool ${toolName}`);
        return [
          toolName,
          {
            ...tool,
            execute: async (args: any, context: any) => {
              // Ensure JWT is always included for operations
              const enhancedArgs = { ...args, jwt: clientJwt };
              console.log(
                `[${this.constructor.name}] Calling tool ${toolName} with args:`,
                enhancedArgs
              );
              console.log(
                `[${this.constructor.name}] Tool ${toolName} execute function:`,
                typeof tool.execute
              );
              console.log(
                `[${this.constructor.name}] About to execute tool ${toolName}`
              );

              // Pass environment to tools that need it
              const enhancedContext = { ...context, env: this.env };
              const result = await tool.execute?.(
                enhancedArgs,
                enhancedContext
              );
              console.log(
                `[${this.constructor.name}] Tool ${toolName} result:`,
                result
              );
              return result;
            },
          },
        ];
      })
    );
  }
}
