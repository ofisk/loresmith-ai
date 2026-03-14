/**
 * Utilities for handling tool parts in both legacy (tool-invocation) and
 * typed (tool-{toolName}) formats per AI SDK stream protocol.
 *
 * Legacy: part.type === "tool-invocation", part.toolInvocation with state "call"|"result", args, result
 * New: part.type === "tool-{toolName}", part has state "input-streaming"|"input-available"|"output-available", input, output
 */

export type NormalizedToolState =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

export interface NormalizedToolPart {
	toolName: string;
	toolCallId: string;
	state: NormalizedToolState | "call" | "result";
	input?: unknown;
	output?: unknown;
}

/** True if part is a tool part (legacy or typed format). */
export function isToolPart(part: unknown): part is Record<string, unknown> {
	if (!part || typeof part !== "object" || !("type" in part)) return false;
	const p = part as Record<string, unknown>;
	if (p.type === "tool-invocation" && p.toolInvocation) return true;
	if (typeof p.type === "string" && p.type.startsWith("tool-")) return true;
	return false;
}

/**
 * Extract normalized tool part info from legacy or typed format.
 * Maps legacy "call" -> "input-available", "result" -> "output-available".
 */
export function getToolPartInfo(part: unknown): NormalizedToolPart | null {
	if (!part || typeof part !== "object") return null;
	const p = part as Record<string, unknown>;
	if (p.type === "tool-invocation" && p.toolInvocation) {
		const ti = p.toolInvocation as Record<string, unknown>;
		const state = (ti.state as string) ?? "";
		return {
			toolName: String(ti.toolName ?? ""),
			toolCallId: String(ti.toolCallId ?? ""),
			state:
				state === "result"
					? "output-available"
					: state === "call"
						? "input-available"
						: (state as NormalizedToolState),
			input: ti.args,
			output: ti.result,
		};
	}
	if (typeof p.type === "string" && p.type.startsWith("tool-")) {
		const toolName =
			(typeof p.toolName === "string" ? p.toolName : p.type.slice(5)) ?? "";
		const toolCallId =
			(typeof p.toolCallId === "string" ? p.toolCallId : "") ?? "";
		const state = ((p.state as string) ?? "input-available") as
			| NormalizedToolState
			| "call"
			| "result";
		return {
			toolName,
			toolCallId,
			state:
				state === "result"
					? "output-available"
					: state === "call"
						? "input-available"
						: state,
			input: p.input,
			output: p.output,
		};
	}
	return null;
}

/** True if tool part is waiting for user confirmation (input ready, not yet executed). */
export function isPendingConfirmation(state: string): boolean {
	return state === "call" || state === "input-available";
}

/** True if tool part has completed (output available). */
export function isComplete(state: string): boolean {
	return state === "result" || state === "output-available";
}
