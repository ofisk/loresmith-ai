import type { Explainability } from "./explainability";

/** Legacy tool part (tool-invocation) - supported for backward compatibility. */
export interface LegacyToolInvocationPart {
	type: "tool-invocation";
	toolInvocation?: {
		state: string;
		toolName: string;
		toolCallId: string;
		args?: unknown;
		result?: unknown;
	};
}

/** Typed tool part (tool-{toolName}) per AI SDK stream protocol. */
export interface TypedToolPart {
	type: `tool-${string}`;
	toolName: string;
	toolCallId: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	input?: unknown;
	output?: unknown;
}

export interface Message {
	id?: string;
	role: string;
	content?: string;
	parts?: Array<
		| { type: "text"; text?: string }
		| LegacyToolInvocationPart
		| TypedToolPart
		| { type: string; text?: string; [key: string]: unknown }
	>;
	createdAt?: Date | string;
	/** May include explainability, jwt, campaignId, sessionId, etc. */
	data?: Record<string, unknown> & { explainability?: Explainability | null };
}
