import { APICallError, RetryError } from "ai";
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
	it("detects transient APICallError via status code without relying on message text", () => {
		const error = new APICallError({
			message: "",
			url: "https://api.openai.com/v1/chat/completions",
			requestBodyValues: {},
			statusCode: 429,
			responseHeaders: {},
			responseBody: "",
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
		"Request timed out while waiting for model",
		"Rate limit exceeded for this workspace",
		"Too many requests — try again later",
		"execution_time_exceeded",
		"no output generated from model",
		"empty response body",
	])("matches transient text patterns: %s", (message) => {
		expect(isLikelyTransientLlmFailure(new Error(message))).toBe(true);
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
});
