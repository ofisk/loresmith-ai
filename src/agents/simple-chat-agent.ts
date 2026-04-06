// Base for chat Durable Objects: must extend cloudflare:workers `DurableObject` so
// `routeAgentRequest` (agents package) can use RPC stubs against the Chat binding.

import { DurableObject } from "cloudflare:workers";

export interface SimpleChatAgentEnv {
	Chat: DurableObjectNamespace;
	[key: string]: unknown;
}

/**
 * Basic message interface for chat messages
 */
export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	[key: string]: unknown;
}

export abstract class SimpleChatAgent<
	T extends SimpleChatAgentEnv = SimpleChatAgentEnv,
> extends DurableObject<T> {
	protected messages: ChatMessage[] = [];

	/**
	 * Add a message to the conversation
	 */
	addMessage(message: ChatMessage): void {
		this.messages.push(message);
	}

	/**
	 * Get all messages in the conversation
	 */
	getMessages(): ChatMessage[] {
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
		onFinish: (message: ChatMessage) => void | Promise<void>,
		options?: { abortSignal?: AbortSignal }
	): Promise<Response>;
}
