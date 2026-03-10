import { describe, expect, it } from "vitest";
import {
	estimateMessagesTokens,
	estimateMessageTokens,
	estimateRequestTokens,
	estimateTokenCount,
	estimateToolsTokens,
	getModelContextLimit,
	getSafeContextLimit,
	MODEL_CONTEXT_LIMITS,
	truncateMessagesToFit,
} from "@/lib/token-utils";

describe("estimateTokenCount", () => {
	it("returns 0 for empty string", () => {
		expect(estimateTokenCount("")).toBe(0);
	});

	it("estimates ~4 chars per token", () => {
		expect(estimateTokenCount("aaaa")).toBe(1);
		expect(estimateTokenCount("a".repeat(8))).toBe(2);
	});

	it("rounds up partial tokens", () => {
		expect(estimateTokenCount("a".repeat(5))).toBe(2);
	});
});

describe("estimateMessageTokens", () => {
	it("counts role overhead", () => {
		expect(estimateMessageTokens({ role: "user" })).toBeGreaterThanOrEqual(1);
	});

	it("counts string content", () => {
		const msg = { role: "user", content: "a".repeat(40) };
		expect(estimateMessageTokens(msg)).toBeGreaterThan(10);
	});

	it("counts array content with text parts", () => {
		const msg = {
			role: "user",
			content: [{ type: "text", text: "hello" }],
		};
		expect(estimateMessageTokens(msg)).toBeGreaterThan(0);
	});

	it("counts tool calls overhead", () => {
		const msg = {
			role: "assistant",
			toolCalls: [{ id: "1" }, { id: "2" }],
		};
		expect(estimateMessageTokens(msg)).toBeGreaterThan(50);
	});
});

describe("estimateMessagesTokens", () => {
	it("sums tokens across messages", () => {
		const messages = [
			{ role: "user", content: "a".repeat(40) },
			{ role: "assistant", content: "b".repeat(40) },
		];
		expect(estimateMessagesTokens(messages)).toBe(
			estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1])
		);
	});
});

describe("estimateToolsTokens", () => {
	it("counts tool name and description", () => {
		const tools = {
			myTool: { description: "Does something" },
		};
		expect(estimateToolsTokens(tools)).toBeGreaterThan(0);
	});

	it("counts inputSchema when present", () => {
		const tools = {
			tool: {
				description: "x",
				inputSchema: { type: "object", properties: {} },
			},
		};
		expect(estimateToolsTokens(tools)).toBeGreaterThan(0);
	});
});

describe("getModelContextLimit", () => {
	it("returns default for undefined", () => {
		expect(getModelContextLimit(undefined)).toBe(
			MODEL_CONTEXT_LIMITS["gpt-5.2"]
		);
	});

	it("returns exact match for known model", () => {
		expect(getModelContextLimit("gpt-4o")).toBe(128000);
		expect(getModelContextLimit("gpt-3.5-turbo")).toBe(16385);
	});

	it("matches by prefix for gpt-5.2", () => {
		expect(getModelContextLimit("gpt-5.2-something")).toBe(
			MODEL_CONTEXT_LIMITS["gpt-5.2"]
		);
	});

	it("matches by prefix for gpt-4", () => {
		expect(getModelContextLimit("gpt-4-turbo")).toBe(128000);
	});
});

describe("getSafeContextLimit", () => {
	it("returns 90% of model limit", () => {
		expect(getSafeContextLimit("gpt-4o")).toBe(Math.floor(128000 * 0.9));
	});
});

describe("estimateRequestTokens", () => {
	it("sums system prompt, messages, and tools", () => {
		const tokens = estimateRequestTokens(
			"system",
			[{ role: "user", content: "hi" }],
			{ t: { description: "x" } }
		);
		expect(tokens).toBeGreaterThan(0);
	});
});

describe("truncateMessagesToFit", () => {
	it("returns empty when no token budget", () => {
		const result = truncateMessagesToFit(
			[{ role: "user", content: "hi" }],
			100,
			100,
			0
		);
		expect(result).toEqual([]);
	});

	it("keeps system messages", () => {
		const msgs = [
			{ role: "system", content: "You are helpful" },
			{ role: "user", content: "a".repeat(1000) },
		];
		const result = truncateMessagesToFit(msgs, 500, 0, 0);
		expect(result.some((m: { role: string }) => m.role === "system")).toBe(
			true
		);
	});

	it("adds truncation note when messages are dropped", () => {
		const msgs = [
			{ role: "user", content: "a".repeat(500) },
			{ role: "user", content: "b".repeat(500) },
		];
		const result = truncateMessagesToFit(msgs, 100, 0, 0);
		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					role: "system",
					content: expect.stringContaining("Context truncated"),
				}),
			])
		);
	});
});
