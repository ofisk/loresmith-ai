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

const TRANSIENT_HTTP_STATUS_CODES = new Set([429, 529]);

/** Substrings / patterns in describeLlmFailure output for non-API transient signals. */
const TRANSIENT_FAILURE_TEXT_PATTERNS: ReadonlyArray<RegExp> = [
	/overloaded/,
	/status 529/,
	/rate limit/,
	/\b429\b/,
	/too many requests/,
	/timeout/,
	/timed out/,
	/execution_time_exceeded/,
	/failed after/,
	/no output generated/,
	/empty response/,
];

function walkLlmErrorTree(
	error: unknown,
	visit: (item: unknown) => void,
	maxDepth = 8
): void {
	const seen = new Set<unknown>();

	function walk(current: unknown, depth: number): void {
		if (current == null || depth > maxDepth || seen.has(current)) {
			return;
		}
		seen.add(current);
		visit(current);

		if (RetryError.isInstance(current)) {
			for (const nested of current.errors) {
				walk(nested, depth + 1);
			}
		}

		const cause = readCause(current);
		if (cause != null) {
			walk(cause, depth + 1);
		}
	}

	walk(error, 0);
}

function hasTransientStructuredSignal(error: unknown): boolean {
	let transient = false;

	walkLlmErrorTree(error, (item) => {
		if (transient) {
			return;
		}

		if (!APICallError.isInstance(item)) {
			return;
		}

		const code = item.statusCode;
		if (code != null && TRANSIENT_HTTP_STATUS_CODES.has(code)) {
			transient = true;
		}
	});

	return transient;
}

function matchesTransientFailureText(text: string): boolean {
	const lower = text.toLowerCase();
	return TRANSIENT_FAILURE_TEXT_PATTERNS.some((pattern) => pattern.test(lower));
}

export function isLikelyTransientLlmFailure(error: unknown): boolean {
	if (hasTransientStructuredSignal(error)) {
		return true;
	}
	return matchesTransientFailureText(describeLlmFailure(error));
}
