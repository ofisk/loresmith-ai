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
