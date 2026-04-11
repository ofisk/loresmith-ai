// Chat DOs must extend partyserver `Server` (extends DurableObject). `routeAgentRequest`
// → `routePartykitRequest` calls stub._initAndFetch(name, props, req) over RPC; plain
// DurableObject does not implement that method.

import { Server } from "partyserver";

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
	_T extends SimpleChatAgentEnv = SimpleChatAgentEnv,
> extends Server<any> {
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
	 * Non-WebSocket HTTP to the DO (after Server.fetch sets name / init).
	 */
	async onRequest(_request: Request): Promise<Response> {
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
