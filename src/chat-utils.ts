import { formatDataStreamPart } from "@ai-sdk/ui-utils";
import { getToolPartInfo, isComplete, isToolPart } from "@/lib/tool-part-utils";
import type { Message } from "@/types/ai-message";
import { APPROVAL } from "./shared-config";

function isValidToolName<K extends PropertyKey, T extends object>(
	key: K,
	obj: T
): key is K & keyof T {
	return key in obj;
}

type ExecutionContext = {
	messages: any[];
	toolCallId: string;
};

interface ProcessToolCallsOptions {
	tools: Record<string, unknown>; // kept for compatibility
	dataStream: { write: (chunk: unknown) => void };
	messages: Message[];
	executions: Record<
		string,
		((args: any, context: ExecutionContext) => Promise<unknown>) | undefined
	>;
}

/**
 * Processes tool invocations where human input is required, executing tools when authorized.
 *
 * @param options - The function options
 * @param options.tools - Map of tool names to Tool instances that may expose execute functions
 * @param options.dataStream - Data stream for sending results back to the client
 * @param options.messages - Array of messages to process
 * @param executionFunctions - Map of tool names to execute functions
 * @returns Promise resolving to the processed messages
 */
export async function processToolCalls({
	dataStream,
	messages,
	executions,
}: ProcessToolCallsOptions): Promise<Message[]> {
	const lastMessage = messages[messages.length - 1];
	const parts = lastMessage?.parts;
	if (!parts) return messages;

	const processedParts = await Promise.all(
		parts.map(async (part) => {
			if (!isToolPart(part)) return part;

			const info = getToolPartInfo(part);
			if (!info || !(info.toolName in executions) || !isComplete(info.state))
				return part;

			const approval = info.output;
			let result: unknown;

			if (approval === APPROVAL.YES) {
				if (!isValidToolName(info.toolName, executions)) return part;

				const toolInstance = executions[info.toolName as string];
				if (toolInstance) {
					result = await toolInstance(info.input, {
						messages,
						toolCallId: info.toolCallId,
					});
				} else {
					result = "Error: No execute function found on tool";
				}
			} else if (approval === APPROVAL.NO) {
				result = "Error: User denied access to tool execution";
			} else {
				return part;
			}

			dataStream.write(
				formatDataStreamPart("tool_result", {
					toolCallId: info.toolCallId,
					result,
				})
			);

			const legacyPart = part as {
				type: string;
				toolInvocation?: {
					state: string;
					toolName: string;
					toolCallId: string;
					args?: unknown;
					result?: unknown;
				};
			};
			if (legacyPart.type === "tool-invocation" && legacyPart.toolInvocation) {
				return {
					...part,
					toolInvocation: { ...legacyPart.toolInvocation, result },
				};
			}
			return { ...part, output: result };
		})
	);

	// Finally return the processed messages
	return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
}

// export function getToolsRequiringConfirmation<
//   T extends ToolSet
//   // E extends {
//   //   [K in keyof T as T[K] extends { execute: Function } ? never : K]: T[K];
//   // },
// >(tools: T): string[] {
//   return (Object.keys(tools) as (keyof T)[]).filter((key) => {
//     const maybeTool = tools[key];
//     return typeof maybeTool.execute !== "function";
//   }) as string[];
// }
