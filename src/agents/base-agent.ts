import { AIChatAgent } from "agents/ai-chat-agent";
import {
  createDataStreamResponse,
  generateId,
  type StreamTextOnFinishCallback,
  streamText,
  type ToolSet,
} from "ai";
import { processToolCalls } from "../utils";

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

        // Process any pending tool calls from previous messages
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: this.tools,
          executions: {}, // Tools have their own execute functions
        });

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
          `[${this.constructor.name}] About to call streamText with maxSteps: 3...`
        );

        // Create enhanced tools that automatically include JWT
        const enhancedTools = this.createEnhancedTools(clientJwt);

        // Stream the AI response using the provided model
        const result = streamText({
          model: this.model,
          system: this.systemPrompt,
          toolChoice: "auto", // Let the model decide when to use tools, but limit to one call
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
          maxSteps: 1, // Limit to exactly one tool call per request
        });

        // Merge the AI response stream with tool execution outputs
        if (
          result &&
          typeof (
            result as { mergeIntoDataStream?: (dataStream: unknown) => void }
          ).mergeIntoDataStream === "function"
        ) {
          (
            result as { mergeIntoDataStream: (dataStream: unknown) => void }
          ).mergeIntoDataStream(dataStream);
        }
      },
    });

    return dataStreamResponse;
  }

  /**
   * Execute a scheduled task
   */
  async executeTask(description: string, _task: any) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
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
              const result = await tool.execute?.(enhancedArgs, context);
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
