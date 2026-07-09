import { APICallError, RetryError } from "ai";

type ErrorWithCause = Error & { cause?: unknown };

function readCause(error: unknown): unknown {
	if (!(error instanceof Error)) {
		return undefined;
	}
	const cause = (error as ErrorWithCause).cause;
	return cause == null ? undefined : cause;
}

/** Attach cause without requiring ES2022 Error constructor options. */
export function wrapLlmError(message: string, cause: unknown): Error {
	const err = new Error(message) as ErrorWithCause;
	err.cause = cause;
	return err;
}

function unwrapErrorChain(error: unknown, maxDepth = 8): unknown[] {
	const chain: unknown[] = [];
	const seen = new Set<unknown>();
	let current: unknown = error;

	for (let depth = 0; depth < maxDepth && current != null; depth++) {
		if (seen.has(current)) break;
		seen.add(current);
		chain.push(current);

		if (RetryError.isInstance(current)) {
			for (const nested of current.errors) {
				if (!seen.has(nested)) {
					current = nested;
				}
			}
			break;
		}

		const cause = readCause(current);
		if (cause != null && !seen.has(cause)) {
			current = cause;
			continue;
		}

		break;
	}

	return chain;
}

function describeSingleLlmFailure(error: unknown): string | null {
	if (APICallError.isInstance(error)) {
		const parts = [
			error.message?.trim() || null,
			error.statusCode != null ? `status ${error.statusCode}` : null,
			error.url ? `url ${error.url}` : null,
			error.responseBody
				? `response ${String(error.responseBody).slice(0, 500)}`
				: null,
			error.isRetryable === true ? "retryable" : null,
		].filter(Boolean);
		return parts.length > 0 ? parts.join("; ") : "API call failed (no details)";
	}

	if (RetryError.isInstance(error)) {
		const last = error.lastError ?? error.errors[error.errors.length - 1];
		const lastDetail = last ? describeLlmFailure(last) : "unknown nested error";
		return `${error.reason}: ${lastDetail}`;
	}

	if (error instanceof Error) {
		const name = error.name && error.name !== "Error" ? `${error.name}: ` : "";
		const message = error.message?.trim();
		if (message) {
			return `${name}${message}`;
		}
		return name ? name.slice(0, -2) : null;
	}

	if (typeof error === "string" && error.trim()) {
		return error.trim();
	}

	try {
		const serialized = JSON.stringify(error);
		if (serialized && serialized !== "{}") {
			return serialized.slice(0, 500);
		}
	} catch {
		// ignore
	}

	return null;
}

/**
 * Produce a single human-readable LLM failure string, unwrapping RetryError /
 * APICallError chains that providers often wrap in generic Error messages.
 */
export function describeLlmFailure(error: unknown): string {
	const chain = unwrapErrorChain(error);
	const parts: string[] = [];

	for (const item of chain) {
		const detail = describeSingleLlmFailure(item);
		if (detail && !parts.includes(detail)) {
			parts.push(detail);
		}
	}

	if (parts.length > 0) {
		return parts.join(" | ");
	}

	return "Unknown LLM error";
}

export function isLikelyTransientLlmFailure(error: unknown): boolean {
	const text = describeLlmFailure(error).toLowerCase();
	return (
		text.includes("overloaded") ||
		text.includes("status 529") ||
		text.includes("rate limit") ||
		text.includes("429") ||
		text.includes("too many requests") ||
		text.includes("timeout") ||
		text.includes("timed out") ||
		text.includes("execution_time_exceeded") ||
		text.includes("failed after") ||
		text.includes("no output generated") ||
		text.includes("empty response")
	);
}
