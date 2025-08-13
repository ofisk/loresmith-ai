// Simple chat agent base class that doesn't depend on the agents package
// This avoids the nanoid hoisting issues while providing the core functionality we need

export interface SimpleChatAgentEnv {
  ADMIN_SECRET?: string;
  Chat: DurableObjectNamespace;
  UserFileTracker: DurableObjectNamespace;
  [key: string]: any;
}

export abstract class SimpleChatAgent<
  T extends SimpleChatAgentEnv = SimpleChatAgentEnv,
> {
  protected ctx: DurableObjectState;
  protected env: T;
  protected messages: any[] = [];

  constructor(ctx: DurableObjectState, env: T) {
    this.ctx = ctx;
    this.env = env;
  }

  /**
   * Add a message to the conversation
   */
  addMessage(message: any): void {
    this.messages.push(message);
  }

  /**
   * Get all messages in the conversation
   */
  getMessages(): any[] {
    return this.messages;
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * Handle HTTP requests to the durable object
   */
  async fetch(_request: Request): Promise<Response> {
    // Default implementation - subclasses can override
    return new Response("Method not implemented", { status: 501 });
  }

  /**
   * Abstract method for handling chat messages
   */
  abstract onChatMessage(
    onFinish: any,
    options?: { abortSignal?: AbortSignal }
  ): Promise<Response>;
}
