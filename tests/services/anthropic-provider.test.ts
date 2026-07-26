import { beforeEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "@/services/llm/anthropic-provider";

const generateTextMock = vi.fn();
const createAnthropicMock = vi.fn();
const modelFactoryMock = vi.fn();

vi.mock("ai", () => ({
	APICallError: { isInstance: () => false },
	generateText: (...args: unknown[]) => generateTextMock(...args),
}));

vi.mock("@ai-sdk/anthropic", () => ({
	createAnthropic: (...args: unknown[]) => createAnthropicMock(...args),
}));

type TextPart = {
	type: string;
	text: string;
	providerOptions?: { anthropic?: { cacheControl?: { type?: string } } };
};

function lastCallMessages(): Array<{ role: string; content: TextPart[] }> {
	const call = generateTextMock.mock.calls.at(-1)?.[0] as {
		messages?: Array<{ role: string; content: TextPart[] }>;
	};
	return call?.messages ?? [];
}

beforeEach(() => {
	vi.clearAllMocks();
	modelFactoryMock.mockImplementation((modelId: string) => ({ modelId }));
	createAnthropicMock.mockReturnValue(modelFactoryMock);
});

describe("AnthropicProvider.generateSummary", () => {
	it("places a cache breakpoint on the prefix when parts are supplied", async () => {
		generateTextMock.mockResolvedValue({
			text: "a summary",
			usage: { inputTokens: 10, outputTokens: 2 },
		});

		const provider = new AnthropicProvider("key");
		await provider.generateSummary("ignored when parts are given", {
			model: "claude-sonnet-5",
			structuredPromptParts: {
				cacheablePrefix: "STABLE INSTRUCTIONS",
				variableSuffix: "VARIABLE DATA",
			},
		});

		const [message] = lastCallMessages();
		expect(message.content).toHaveLength(2);
		expect(message.content[0].text).toBe("STABLE INSTRUCTIONS");
		expect(message.content[0].providerOptions?.anthropic?.cacheControl).toEqual(
			{
				type: "ephemeral",
			}
		);
		// The breakpoint must not also sit on the variable part, or nothing is reused.
		expect(message.content[1].text).toBe("VARIABLE DATA");
		expect(message.content[1].providerOptions).toBeUndefined();
	});

	it("sends a plain prompt when no parts are supplied", async () => {
		generateTextMock.mockResolvedValue({
			text: "a summary",
			usage: { totalTokens: 5 },
		});

		const provider = new AnthropicProvider("key");
		await provider.generateSummary("just a prompt", {
			model: "claude-sonnet-5",
		});

		const call = generateTextMock.mock.calls[0][0] as {
			prompt?: string;
			messages?: unknown;
		};
		expect(call.prompt).toBe("just a prompt");
		expect(call.messages).toBeUndefined();
	});

	it("reports the cache breakdown to onUsage", async () => {
		generateTextMock.mockResolvedValue({
			text: "a summary",
			usage: {
				inputTokens: 100,
				outputTokens: 10,
				totalTokens: 110,
				cachedInputTokens: 4096,
			},
			providerMetadata: {
				anthropic: { usage: { cache_creation_input_tokens: 2048 } },
			},
		});

		const onUsage = vi.fn();
		const provider = new AnthropicProvider("key");
		await provider.generateSummary("prompt", {
			model: "claude-sonnet-5",
			onUsage,
		});

		expect(onUsage).toHaveBeenCalledTimes(1);
		const [usage] = onUsage.mock.calls[0];
		expect(usage.tokens).toBe(110);
		// Cache reads and writes are the only proof a breakpoint is live.
		expect(usage.cachedInputTokens).toBe(4096);
		expect(usage.cacheWriteTokens).toBe(2048);
	});
});

describe("AnthropicProvider.generateStructuredOutput", () => {
	it("repairs recoverable JSON without a second LLM call", async () => {
		generateTextMock.mockResolvedValue({
			// Trailing comma: fixable locally, so no repair call should follow.
			text: '{"ok": true,}',
			usage: { totalTokens: 42 },
		});

		const onJsonRepair = vi.fn();
		const onUsage = vi.fn();
		const provider = new AnthropicProvider("key");
		const result = await provider.generateStructuredOutput<{ ok: boolean }>(
			"prompt",
			{ model: "claude-sonnet-5", onJsonRepair, onUsage }
		);

		expect(result).toEqual({ ok: true });
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		// The counter still fires: it measures parse failures, and comparing it to
		// the call count is how we see the deterministic pass earning its keep.
		expect(onJsonRepair).toHaveBeenCalledTimes(1);
		expect(onUsage.mock.calls[0][0]).toMatchObject({
			tokens: 42,
			queryCount: 1,
		});
	});

	it("falls back to the LLM repair pass when local repair cannot fix it", async () => {
		generateTextMock
			.mockResolvedValueOnce({
				// An unescaped quote mid-string is ambiguous — deliberately not guessed at.
				text: '{"a": "he said "hi" loudly"}',
				usage: { totalTokens: 40 },
			})
			.mockResolvedValueOnce({
				text: '{"a": "he said hi loudly"}',
				usage: { totalTokens: 30 },
			});

		const onUsage = vi.fn();
		const provider = new AnthropicProvider("key");
		const result = await provider.generateStructuredOutput<{ a: string }>(
			"prompt",
			{ model: "claude-sonnet-5", onUsage }
		);

		expect(result).toEqual({ a: "he said hi loudly" });
		expect(generateTextMock).toHaveBeenCalledTimes(2);
		expect(onUsage.mock.calls[0][0]).toMatchObject({
			tokens: 70,
			queryCount: 2,
		});
	});

	it("keeps the JSON schema inside the cached prefix", async () => {
		generateTextMock.mockResolvedValue({
			text: '{"ok": true}',
			usage: { totalTokens: 1 },
		});

		const provider = new AnthropicProvider("key");
		await provider.generateStructuredOutput("prompt", {
			model: "claude-sonnet-5",
			schema: JSON.stringify({ type: "object" }),
			structuredPromptParts: {
				cacheablePrefix: "STABLE",
				variableSuffix: "VARIABLE",
			},
		});

		const [message] = lastCallMessages();
		// The schema is identical on every call; in the suffix it would both
		// shorten the prefix and be re-billed each time.
		expect(message.content[0].text).toContain("STABLE");
		expect(message.content[0].text).toContain("JSON Schema");
		expect(message.content[1].text).toBe("VARIABLE");
	});
});
