import {
	APICallError,
	EmptyResponseBodyError,
	NoContentGeneratedError,
	NoOutputGeneratedError,
	RetryError,
} from "ai";
import { describe, expect, it } from "vitest";
import {
	describeLlmFailure,
	isLikelyTransientLlmFailure,
} from "@/lib/llm-error-utils";

describe("describeLlmFailure", () => {
	it("unwraps RetryError with empty nested API message", () => {
		const retry = new RetryError({
			message: "Failed after 3 attempts. Last error: ",
			reason: "maxRetriesExceeded",
			errors: [
				new APICallError({
					message: "",
					url: "https://api.anthropic.com/v1/messages",
					requestBodyValues: {},
					statusCode: 529,
					responseHeaders: {},
					responseBody: JSON.stringify({
						type: "overloaded_error",
						message: "Overloaded",
					}),
					isRetryable: true,
				}),
			],
		});

		const wrapped = new Error(`Failed to generate summary: ${retry.message}`, {
			cause: retry,
		});

		const detail = describeLlmFailure(wrapped);
		expect(detail).toContain("529");
		expect(detail).toContain("overloaded_error");
		expect(detail).not.toBe("");
	});

	it("describes APICallError response body when message is empty", () => {
		const error = new APICallError({
			message: "",
			url: "https://api.anthropic.com/v1/messages",
			requestBodyValues: {},
			statusCode: 529,
			responseHeaders: {},
			responseBody: '{"type":"overloaded_error","message":"Overloaded"}',
			isRetryable: true,
		});

		expect(describeLlmFailure(error)).toContain("status 529");
		expect(describeLlmFailure(error)).toContain("overloaded_error");
	});

	it("flags transient overload failures", () => {
		const error = new Error(
			"Failed to generate summary: Failed after 3 attempts",
			{
				cause: new APICallError({
					message: "",
					url: "https://api.anthropic.com/v1/messages",
					requestBodyValues: {},
					statusCode: 529,
					responseHeaders: {},
					responseBody: '{"type":"overloaded_error"}',
					isRetryable: true,
				}),
			}
		);

		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});
});

describe("isLikelyTransientLlmFailure", () => {
	it.each([
		429, 502, 503, 529,
	])("detects transient APICallError via status %i", (statusCode) => {
		const error = new APICallError({
			message: "",
			url: "https://api.openai.com/v1/chat/completions",
			requestBodyValues: {},
			statusCode,
			responseHeaders: {},
			responseBody: "",
			isRetryable: true,
		});

		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it("detects retryable APICallError without status (network failure)", () => {
		const error = new APICallError({
			message: "Cannot connect to API",
			url: "https://api.anthropic.com/v1/messages",
			requestBodyValues: {},
			statusCode: undefined,
			responseHeaders: {},
			responseBody: undefined,
			isRetryable: true,
		});

		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it("detects nested transient APICallError inside RetryError", () => {
		const error = new RetryError({
			message: "Failed after 2 attempts. Last error: ",
			reason: "maxRetriesExceeded",
			errors: [
				new APICallError({
					message: "",
					url: "https://api.anthropic.com/v1/messages",
					requestBodyValues: {},
					statusCode: 529,
					responseHeaders: {},
					responseBody: '{"type":"overloaded_error"}',
					isRetryable: true,
				}),
			],
		});

		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it.each([
		"maxRetriesExceeded",
		"abort",
	] as const)("detects RetryError via reason %s even without nested API metadata", (reason) => {
		const error = new RetryError({
			message: "Failed after retries",
			reason,
			errors: [new Error("underlying failure without status")],
		});

		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it("does not flag RetryError when nested API error is permanent", () => {
		const error = new RetryError({
			message: "Failed after 2 attempts. Last error: Invalid request",
			reason: "errorNotRetryable",
			errors: [
				new APICallError({
					message: "Invalid request",
					url: "https://api.anthropic.com/v1/messages",
					requestBodyValues: {},
					statusCode: 400,
					responseHeaders: {},
					responseBody: '{"type":"invalid_request_error"}',
					isRetryable: false,
				}),
			],
		});

		expect(isLikelyTransientLlmFailure(error)).toBe(false);
	});

	it.each([
		["NoOutputGeneratedError", NoOutputGeneratedError],
		["NoContentGeneratedError", NoContentGeneratedError],
		["EmptyResponseBodyError", EmptyResponseBodyError],
	] as const)("detects typed AI SDK error: %s", (_label, ErrorType) => {
		const error = new ErrorType({ message: "model returned nothing" });
		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it.each([
		"AbortError",
		"TimeoutError",
	] as const)("detects transient runtime error by name: %s", (name) => {
		const error = new Error("operation exceeded deadline");
		error.name = name;
		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it("detects Cloudflare CPU timeout via error.code", () => {
		const error = new Error("Worker exceeded CPU time limit.") as Error & {
			code: string;
		};
		error.code = "execution_time_exceeded";
		expect(isLikelyTransientLlmFailure(error)).toBe(true);
	});

	it("does not flag permanent client errors", () => {
		const error = new APICallError({
			message: "Invalid request",
			url: "https://api.anthropic.com/v1/messages",
			requestBodyValues: {},
			statusCode: 400,
			responseHeaders: {},
			responseBody: '{"type":"invalid_request_error"}',
			isRetryable: false,
		});

		expect(isLikelyTransientLlmFailure(error)).toBe(false);
	});

	it("does not flag generic Error messages without structured signals", () => {
		expect(
			isLikelyTransientLlmFailure(
				new Error("Request timed out while waiting for model")
			)
		).toBe(false);
		expect(
			isLikelyTransientLlmFailure(
				new Error("Rate limit exceeded for workspace")
			)
		).toBe(false);
	});
});
