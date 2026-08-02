import { describe, expect, it } from "vitest";
import {
	containsImplementationDetail,
	GENERIC_FAILURE_MESSAGE,
	sanitizeUserFacingText,
	UNAVAILABLE_MESSAGE,
} from "../../src/lib/user-facing-language";

describe("containsImplementationDetail", () => {
	it.each([
		"Cloudflare's built-in AI doesn't offer that model yet",
		"this campaign's setup doesn't have an audio provider configured",
		"OpenAI API key not configured",
		"AI is not configured for this environment.",
		"Session digest indexing requires database, vector index, and OpenAI API key.",
		"Direct database access is required for house rule creation.",
		"Environment not available",
		"Anthropic returned an error",
		"Workers AI request failed",
		"AutoRAG returned no chunks",
		"Failed to write to R2",
		"D1 query failed",
		"Could not generate embeddings",
		"The LLM timed out",
	])("flags %j", (text) => {
		expect(containsImplementationDetail(text)).toBe(true);
	});

	it.each([
		"Campaign not found",
		"No characters matched that name",
		"That file is still being processed",
		// Tabletop words that must not be mistaken for infrastructure.
		"No creatures found for that environment",
		"The ritual for binding the demon is incomplete",
		"That worker NPC has no stat block",
		"This miniature model has no image",
		"The provider of the quest is unknown",
		// Status codes stay: they aid the model's reasoning and reveal no architecture.
		"HTTP 500",
		"HTTP 404",
	])("leaves %j alone", (text) => {
		expect(containsImplementationDetail(text)).toBe(false);
	});

	it("treats empty input as clean", () => {
		expect(containsImplementationDetail("")).toBe(false);
		expect(containsImplementationDetail(null)).toBe(false);
		expect(containsImplementationDetail(undefined)).toBe(false);
	});
});

describe("sanitizeUserFacingText", () => {
	it("passes ordinary failures through unchanged", () => {
		expect(sanitizeUserFacingText("Campaign not found")).toBe(
			"Campaign not found"
		);
	});

	it("replaces missing-capability wording with the unavailable message", () => {
		expect(sanitizeUserFacingText("OpenAI API key not configured")).toBe(
			UNAVAILABLE_MESSAGE
		);
		expect(
			sanitizeUserFacingText("AI is not configured for this environment.")
		).toBe(UNAVAILABLE_MESSAGE);
		expect(
			sanitizeUserFacingText(
				"Session digest indexing requires database, vector index, and OpenAI API key."
			)
		).toBe(UNAVAILABLE_MESSAGE);
	});

	it("replaces unexpected infrastructure failures with the generic message", () => {
		expect(sanitizeUserFacingText("D1 query failed")).toBe(
			GENERIC_FAILURE_MESSAGE
		);
		expect(sanitizeUserFacingText("Anthropic returned an error")).toBe(
			GENERIC_FAILURE_MESSAGE
		);
	});

	it("never returns text that still leaks implementation detail", () => {
		const leaky = [
			"Cloudflare Workers AI is not enabled",
			"Vectorize index unavailable",
			"Missing ANTHROPIC_API_KEY environment variable",
			"Durable Object storage failed",
		];
		for (const text of leaky) {
			expect(containsImplementationDetail(sanitizeUserFacingText(text))).toBe(
				false
			);
		}
	});

	it("returns the generic message for empty input", () => {
		expect(sanitizeUserFacingText("")).toBe(GENERIC_FAILURE_MESSAGE);
		expect(sanitizeUserFacingText(null)).toBe(GENERIC_FAILURE_MESSAGE);
	});
});
