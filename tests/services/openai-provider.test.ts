import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "@/services/llm/openai-provider";

const generateTextMock = vi.fn();
const createOpenAIMock = vi.fn();
const modelFactoryMock = vi.fn();

vi.mock("ai", () => ({
	APICallError: {
		isInstance: () => false,
	},
	generateText: (...args: unknown[]) => generateTextMock(...args),
	Output: {
		json: vi.fn(() => ({ type: "json" })),
	},
}));

vi.mock("@ai-sdk/openai", () => ({
	createOpenAI: (...args: unknown[]) => createOpenAIMock(...args),
}));

describe("OpenAIProvider.generateStructuredOutput", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		modelFactoryMock.mockImplementation((modelId: string) => ({ modelId }));
		createOpenAIMock.mockReturnValue({
			chat: modelFactoryMock,
		});
		generateTextMock.mockResolvedValue({
			output: { ok: true },
			usage: { totalTokens: 123 },
		});
	});

	it("uses json_schema response format when schema is provided", async () => {
		const provider = new OpenAIProvider("test-key");
		const schema = JSON.stringify({
			type: "object",
			properties: {
				ok: { type: "boolean" },
			},
			required: ["ok"],
		});

		const result = await provider.generateStructuredOutput<{ ok: boolean }>(
			"Return a result",
			{
				model: "gpt-5-mini",
				schema,
			}
		);

		expect(result).toEqual({ ok: true });
		expect(generateTextMock).toHaveBeenCalledTimes(1);
		const callArg = generateTextMock.mock.calls[0][0] as {
			providerOptions?: {
				openai?: {
					responseFormat?: { type?: string };
					response_format?: { type?: string };
				};
			};
		};
		expect(callArg.providerOptions?.openai?.responseFormat?.type).toBe(
			"json_schema"
		);
		expect(callArg.providerOptions?.openai?.response_format?.type).toBe(
			"json_schema"
		);
	});

	it("falls back to json_object path when schema is invalid json", async () => {
		const provider = new OpenAIProvider("test-key");
		await provider.generateStructuredOutput("Return JSON", {
			model: "gpt-5-mini",
			schema: "{not-valid-json",
		});

		expect(generateTextMock).toHaveBeenCalledTimes(1);
		const callArg = generateTextMock.mock.calls[0][0] as {
			providerOptions?: {
				openai?: {
					responseFormat?: { type?: string };
					response_format?: { type?: string };
				};
			};
		};
		expect(callArg.providerOptions?.openai?.responseFormat?.type).toBe(
			"json_object"
		);
		expect(callArg.providerOptions?.openai?.response_format?.type).toBe(
			"json_object"
		);
	});
});
