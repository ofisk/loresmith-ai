import type { Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import { generateId, type StreamTextOnFinishCallback, type ToolSet } from "ai";
import { JWT_STORAGE_KEY } from "@/app-constants";
import type { AgentType } from "@/lib/agent-router";
import { AgentRouter } from "@/lib/agent-router";
import { ModelManager } from "@/lib/model-manager";
import { AgentRegistryService } from "@/lib/agent-registry";
import type { AuthEnv } from "@/services/core/auth-service";
import { AuthService } from "@/services/core/auth-service";
import { AuthenticationRequiredError, OpenAIAPIKeyError } from "@/lib/errors";
import { notifyAuthenticationRequired } from "@/lib/notifications";
import type { Env as MiddlewareEnv } from "@/middleware/auth";

interface Env extends AuthEnv {
  ADMIN_SECRET?: string;
  OPENAI_API_KEY?: string;
  R2: R2Bucket;
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: any;
  CHAT: DurableObjectNamespace;
  UPLOAD_SESSION: DurableObjectNamespace;
  NOTIFICATIONS: DurableObjectNamespace;
  ASSETS: Fetcher;
  FILE_PROCESSING_QUEUE: Queue;
  FILE_PROCESSING_DLQ: Queue;
  AUTORAG_API_TOKEN: string;
}

/**
 * Chat Agent implementation that routes to specialized agents based on user intent
 */
export class Chat extends AIChatAgent<Env> {
  private agents: Map<string, any> = new Map();
  private userOpenAIKey: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.agents = new Map();

    this.loadUserOpenAIKey();
  }

  /**
   * Extract and store JWT token from message data if available
   * @param lastUserMessage - The last user message to extract JWT from
   * @returns The JWT token if found in storage or message data, null otherwise
   */
  private async extractAndStoreJwtFromMessage(
    lastUserMessage: any
  ): Promise<string | null> {
    // First check durable object storage
    let jwtToken = await this.ctx.storage.get<string>(JWT_STORAGE_KEY);

    // If not in storage, try to extract from message data
    if (
      !jwtToken &&
      lastUserMessage &&
      "data" in lastUserMessage &&
      lastUserMessage.data
    ) {
      const messageData = lastUserMessage.data as { jwt?: string };
      if (messageData.jwt) {
        jwtToken = messageData.jwt;
        await this.ctx.storage.put(JWT_STORAGE_KEY, jwtToken);
        console.log("[Chat] Extracted and stored JWT token from message data");
      }
    }

    return jwtToken || null;
  }

  /**
   * Load the user's OpenAI API key from storage or database
   */
  private async loadUserOpenAIKey() {
    try {
      // First check durable object storage
      let storedKey = await this.ctx.storage.get<string>("userOpenAIKey");

      if (storedKey) {
        console.log(
          "[Chat] Loaded user OpenAI API key from durable object storage"
        );
        this.userOpenAIKey = storedKey;
        await this.initializeAgents(storedKey);
        return;
      }

      // If not in storage, try loading from database if we have a JWT token
      const jwtToken = await this.ctx.storage.get<string>(JWT_STORAGE_KEY);
      if (jwtToken) {
        const username = AuthService.parseJwtForUsername(jwtToken);
        if (username && this.env.DB) {
          console.log(
            "[Chat] Key not in storage, loading from database for user:",
            username
          );
          const dbKey = await AuthService.loadUserOpenAIKeyWithCache(
            username,
            this.env.DB,
            this
          );

          if (dbKey) {
            console.log(
              "[Chat] Loaded user OpenAI API key from database, storing in durable object"
            );
            storedKey = dbKey;
            this.userOpenAIKey = dbKey;
            await this.ctx.storage.put("userOpenAIKey", dbKey);
            await this.initializeAgents(dbKey);
            return;
          }
        }
      }

      console.log(
        "[Chat] No user API key found in storage or database - user must authenticate through the application"
      );
      // Don't initialize agents if no key is stored - this will cause an error
      // when onChatMessage is called, which will trigger the authentication flow
    } catch (error) {
      console.error("[Chat] Error loading user OpenAI API key:", error);
      // Re-throw authentication errors so they can be handled properly
      if (
        error instanceof AuthenticationRequiredError ||
        error instanceof OpenAIAPIKeyError
      ) {
        throw error;
      }
      // For other errors, log but don't throw - allow onChatMessage to handle auth errors
    }
  }

  private async initializeAgents(openAIAPIKey: string | null) {
    try {
      const modelManager = ModelManager.getInstance();

      if (openAIAPIKey) {
        modelManager.initializeModel(openAIAPIKey);
        console.log("[Chat] Initialized model with user OpenAI API key");
      } else {
        throw new OpenAIAPIKeyError(
          "OpenAI API key is required. Please authenticate through the application to provide your OpenAI API key."
        );
      }

      const registeredAgentTypes =
        await AgentRegistryService.getRegisteredAgentTypes();

      for (const agentType of registeredAgentTypes) {
        const agentClass = await AgentRegistryService.getAgentClass(
          agentType as AgentType
        );
        if (agentClass) {
          const agentInstance = new agentClass(
            this.ctx,
            this.env,
            modelManager.getModel()
          );

          this.agents.set(agentType, agentInstance);
        }
      }

      console.log(
        `Agents initialized successfully: ${registeredAgentTypes.join(", ")}`
      );
    } catch (error) {
      console.error("Error initializing agents:", error);
      throw error;
    }
  }

  getCachedKey(): string | null {
    return this.userOpenAIKey;
  }

  /**
   * Set the user's OpenAI API key and initialize all agents with the new key.
   * This is called when a user explicitly sets their API key (e.g., via HTTP request).
   *
   * @param openAIAPIKey - The OpenAI API key to set
   */
  async setUserOpenAIKey(openAIAPIKey: string) {
    this.userOpenAIKey = openAIAPIKey;
    this.ctx.storage.put("userOpenAIKey", openAIAPIKey);

    await this.initializeAgents(openAIAPIKey);
  }

  /**
   * Handle HTTP request to set user's OpenAI API key.
   * This is the HTTP endpoint handler that validates the request and calls setUserOpenAIKey().
   *
   * @param request - The HTTP request containing the API key
   * @returns Promise<Response> - HTTP response indicating success/failure
   */
  private async handleSetUserOpenAIKeyRequest(
    request: Request
  ): Promise<Response> {
    return AuthService.handleSetUserOpenAIKey(request, this);
  }

  /**
   * Cache the user's OpenAI API key without initializing agents.
   * This is part of the OpenAIKeyCache interface and is called when loading
   * keys from the database during caching operations.
   *
   * @param key - The OpenAI API key to cache
   */
  async setCachedKey(key: string): Promise<void> {
    this.userOpenAIKey = key;
    await this.ctx.storage.put("userOpenAIKey", key);
  }

  async clearCachedKey(): Promise<void> {
    this.userOpenAIKey = null;
    await this.ctx.storage.delete("userOpenAIKey");
  }

  /**
   * Handle HTTP requests to the Chat durable object
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/set-user-openai-key") {
      return this.handleSetUserOpenAIKeyRequest(request);
    }

    const authHeader = request.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const jwtToken = authHeader.slice(7);
      await this.ctx.storage.put(JWT_STORAGE_KEY, jwtToken);
      console.log("[Chat] Stored JWT token from Authorization header");
    }

    return super.fetch(request);
  }

  /**
   * Determines which specialized agent should handle the user's request
   * based on keywords and intent in the message and conversation context
   */
  private async determineAgent(userMessage: string): Promise<string> {
    const modelManager = ModelManager.getInstance();
    const model = modelManager.getModel();

    if (!model) {
      console.log(
        "[Chat] No model available for agent routing, using default agent"
      );
      return "campaign-context";
    }

    const intent = await AgentRouter.routeMessage(
      userMessage,
      this.messages
        .slice(-6)
        .map((msg) => msg.content)
        .join(" "),
      null,
      model
    );

    return intent.agent;
  }

  /**
   * Handles incoming chat messages and routes to appropriate specialized agent
   * @param onFinish - Callback function executed when streaming completes
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    try {
      const lastUserMessage = this.messages
        .slice()
        .reverse()
        .find((msg) => msg.role === "user");

      // Extract JWT from message data if available and store it
      const jwtToken =
        await this.extractAndStoreJwtFromMessage(lastUserMessage);

      if (this.agents.size === 0) {
        if (!jwtToken) {
          console.log(
            "[Chat] No JWT token found in storage or message data, requiring authentication"
          );

          // Try to get username from message data JWT if available (for notification purposes)
          let username: string | null = null;
          if (
            lastUserMessage &&
            "data" in lastUserMessage &&
            lastUserMessage.data
          ) {
            const messageData = lastUserMessage.data as { jwt?: string };
            if (messageData.jwt) {
              try {
                username = AuthService.parseJwtForUsername(messageData.jwt);
              } catch (error) {
                console.warn(
                  "[Chat] Failed to parse username from message data JWT:",
                  error
                );
              }
            }
          }

          // Send notification if we have a username, otherwise just throw error
          if (username) {
            try {
              await notifyAuthenticationRequired(
                this.env as unknown as MiddlewareEnv,
                username,
                "OpenAI API key required. Please authenticate to continue."
              );
            } catch (notifyError) {
              console.error(
                "[Chat] Failed to send authentication notification:",
                notifyError
              );
            }
          }

          throw new AuthenticationRequiredError(
            "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
          );
        }

        const username = AuthService.parseJwtForUsername(jwtToken);
        const authResult = await AuthService.handleAgentAuthentication(
          username,
          this.messages.some((msg) => msg.role === "user"),
          this.env.DB,
          this,
          jwtToken
        );

        if (!authResult.shouldProceed) {
          console.log("[Chat] Authentication failed, requiring authentication");
          throw new AuthenticationRequiredError(
            "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
          );
        }

        if (authResult.openAIAPIKey) {
          console.log("[Chat] Initializing agents with user OpenAI API key");
          // Store the key in durable object storage for persistence
          this.userOpenAIKey = authResult.openAIAPIKey;
          await this.ctx.storage.put("userOpenAIKey", authResult.openAIAPIKey);
          await this.initializeAgents(authResult.openAIAPIKey);
        } else {
          console.log(
            "[Chat] No user OpenAI API key found, requiring authentication"
          );
          throw new AuthenticationRequiredError(
            "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
          );
        }
      }

      if (!lastUserMessage) {
        if (this.agents.size === 0) {
          console.log(
            "[Chat] No agents initialized and no user messages, returning empty response"
          );
          return;
        }

        const targetAgentInstance = this.getAgentInstance("campaign-context");
        targetAgentInstance.messages = [...this.messages];
        return targetAgentInstance.onChatMessage(onFinish, {
          abortSignal: _options?.abortSignal,
        });
      }

      if (this.agents.size === 0) {
        console.log(
          "[Chat] Agents not initialized for message processing, requiring authentication"
        );
        throw new AuthenticationRequiredError(
          "AUTHENTICATION_REQUIRED: OpenAI API key required. Please authenticate first."
        );
      }

      const targetAgent = await this.determineAgent(lastUserMessage.content);
      console.log(
        `[Chat] Routing to ${targetAgent} agent for message: "${lastUserMessage.content}"`
      );

      const targetAgentInstance = this.getAgentInstance(targetAgent);
      targetAgentInstance.messages = [...this.messages];

      return targetAgentInstance.onChatMessage(onFinish, {
        abortSignal: _options?.abortSignal,
      });
    } catch (error) {
      // Ensure authentication errors are properly propagated to the client
      if (
        error instanceof AuthenticationRequiredError ||
        error instanceof OpenAIAPIKeyError
      ) {
        console.error("[Chat] Authentication error in onChatMessage:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        // Send structured notification via notification stream
        try {
          // Try to get JWT token from storage or message data
          const lastUserMessage = this.messages
            .slice()
            .reverse()
            .find((msg) => msg.role === "user");
          const jwtToken =
            await this.extractAndStoreJwtFromMessage(lastUserMessage);

          if (jwtToken) {
            const username = AuthService.parseJwtForUsername(jwtToken);
            if (username) {
              await notifyAuthenticationRequired(
                this.env as unknown as MiddlewareEnv,
                username,
                errorMessage
              );
              console.log(
                "[Chat] Sent authentication notification to user:",
                username
              );
            }
          } else {
            console.log(
              "[Chat] No JWT token available to send authentication notification"
            );
          }
        } catch (notifyError) {
          console.error(
            "[Chat] Failed to send authentication notification:",
            notifyError
          );
        }

        // Re-throw the error so the framework propagates it to the client's onError callback
        // The notification system will also trigger the auth modal if possible
        throw error;
      }
      // For other errors, log and re-throw
      console.error("[Chat] Error in onChatMessage:", error);
      throw error;
    }
  }

  /**
   * Get the appropriate agent instance based on the target type
   */
  private getAgentInstance(targetAgent: string): any {
    if (this.agents.size === 0) {
      throw new Error(
        "Agents not initialized. Please set an OpenAI API key first."
      );
    }

    const agentInstance = this.agents.get(targetAgent);
    if (!agentInstance) {
      const firstAgent = this.agents.values().next().value;
      console.warn(`Agent '${targetAgent}' not found, using fallback agent`);
      return firstAgent;
    }

    return agentInstance;
  }

  /**
   * Override onError to properly handle authentication errors and send them to the client
   */
  override onError(error: unknown): void {
    // Check if this is an authentication error
    if (
      error instanceof AuthenticationRequiredError ||
      error instanceof OpenAIAPIKeyError
    ) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[Chat] Authentication error in onError:", errorMessage);

      // The error will be caught by the AIChatAgent framework and sent to the client
      // We just need to ensure it's properly thrown so the framework can handle it
      super.onError(error);
    } else {
      // For other errors, call the parent implementation
      super.onError(error);
    }
  }

  async executeTask(description: string, _task: Schedule<string>) {
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
}
