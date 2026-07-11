import {
	APICallError,
	EmptyResponseBodyError,
	NoContentGeneratedError,
	NoOutputGeneratedError,
	RetryError,
} from "ai";

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

/** HTTP status codes providers use for rate limits, overload, and gateway failures. */
const TRANSIENT_HTTP_STATUS_CODES = new Set([429, 502, 503, 529]);

/**
 * Stable runtime error codes (not message substrings) for platform time limits.
 * Cloudflare Workers attach `code: "execution_time_exceeded"` on CPU timeouts.
 */
const TRANSIENT_RUNTIME_ERROR_CODES = new Set(["execution_time_exceeded"]);

const TRANSIENT_ERROR_NAMES = new Set(["AbortError", "TimeoutError"]);

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

function isTransientApiCallError(error: APICallError): boolean {
	const code = error.statusCode;
	if (code != null && TRANSIENT_HTTP_STATUS_CODES.has(code)) {
		return true;
	}
	// Provider/network layer marks retryable failures (incl. missing status on connect errors).
	if (error.isRetryable === true && (code == null || code >= 500)) {
		return true;
	}
	return false;
}

/**
 * RetryError.reason values that mean the SDK exhausted retries or aborted —
 * i.e. the underlying failure was treated as retryable / interruptible.
 * `errorNotRetryable` is intentionally excluded; nested errors decide that case.
 */
const TRANSIENT_RETRY_REASONS = new Set(["maxRetriesExceeded", "abort"]);

function isTransientStructuredNode(error: unknown): boolean {
	if (APICallError.isInstance(error)) {
		return isTransientApiCallError(error);
	}

	if (RetryError.isInstance(error)) {
		return TRANSIENT_RETRY_REASONS.has(error.reason);
	}

	if (
		NoOutputGeneratedError.isInstance(error) ||
		NoContentGeneratedError.isInstance(error) ||
		EmptyResponseBodyError.isInstance(error)
	) {
		return true;
	}

	if (error instanceof Error) {
		if (TRANSIENT_ERROR_NAMES.has(error.name)) {
			return true;
		}
		const runtimeCode = (error as Error & { code?: unknown }).code;
		if (
			typeof runtimeCode === "string" &&
			TRANSIENT_RUNTIME_ERROR_CODES.has(runtimeCode)
		) {
			return true;
		}
	}

	return false;
}

/**
 * Whether an LLM failure is likely transient (rate limit, overload, timeout,
 * empty model output) and worth retrying or falling back to a lighter model.
 *
 * Uses typed AI SDK errors and HTTP metadata only — not error message text.
 */
export function isLikelyTransientLlmFailure(error: unknown): boolean {
	let transient = false;

	walkLlmErrorTree(error, (item) => {
		if (transient) {
			return;
		}
		if (isTransientStructuredNode(item)) {
			transient = true;
		}
	});

	return transient;
}
