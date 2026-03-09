import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, Output } from "ai";
import { MODEL_CONFIG } from "@/app-constants";
import { LLMProviderAPIKeyError } from "@/lib/errors";
import type {
	LLMOptions,
	LLMProvider,
	StructuredOutputOptions,
} from "./llm-provider";

function parseStructuredSchema(
	schema?: string
): Record<string, unknown> | null {
	if (!schema || !schema.trim()) {
		return null;
	}
	try {
		const parsed = JSON.parse(schema) as Record<string, unknown>;
		if (!parsed || typeof parsed !== "object") {
			return null;
		}
		return parsed;
	} catch (_error) {
		return null;
	}
}

/**
 * OpenAI provider implementation for LLM generation
 */
export class OpenAIProvider implements LLMProvider {
	private readonly apiKey: string;
	private readonly defaultModel: string;
	private readonly defaultTemperature: number;
	private readonly defaultMaxTokens: number;

	constructor(
		apiKey: string,
		options: {
			defaultModel?: string;
			defaultTemperature?: number;
			defaultMaxTokens?: number;
		} = {}
	) {
		if (!apiKey) {
			throw new LLMProviderAPIKeyError();
		}

		this.apiKey = apiKey;
		// Default to interactive tier; background pipelines should pass explicit defaults.
		this.defaultModel = options.defaultModel || MODEL_CONFIG.OPENAI.INTERACTIVE;
		this.defaultTemperature = options.defaultTemperature ?? 0.3;
		this.defaultMaxTokens = options.defaultMaxTokens ?? 2000;
	}

	/**
	 * Generate plain-text summary using the same AI SDK (generateText) as the chat agent.
	 */
	async generateSummary(
		prompt: string,
		options: LLMOptions = {}
	): Promise<string> {
		const modelId = options.model || this.defaultModel;
		const temperature = options.temperature ?? this.defaultTemperature;
		const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

		try {
			const openaiWithKey = createOpenAI({ apiKey: this.apiKey });
			const model = openaiWithKey(modelId as any);

			// Reasoning models (gpt-5-mini, gpt-5.2, etc.) do not support temperature
			const result = await generateText({
				model,
				prompt,
				maxOutputTokens: maxTokens,
				...(!MODEL_CONFIG.isReasoningModel(modelId) && {
					temperature,
				}),
			});

			const text = result.text;
			if (text === undefined || text === null) {
				throw new Error("OpenAI API returned empty response");
			}
			const tokens =
				(result.usage as { totalTokens?: number })?.totalTokens ??
				((result.usage as { promptTokens?: number })?.promptTokens ?? 0) +
					((result.usage as { completionTokens?: number })?.completionTokens ??
						0);
			if (tokens > 0 && options.onUsage) {
				await options.onUsage(
					{ tokens, queryCount: 1 },
					{ username: options.username, model: modelId }
				);
			}
			return text;
		} catch (error) {
			console.error("[OpenAIProvider] Error generating summary:", error);
			if (error instanceof LLMProviderAPIKeyError) {
				throw error;
			}
			throw new Error(
				`Failed to generate summary: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	/**
	 * Generate structured JSON output using the same AI SDK (generateText + Output.json())
	 * as the chat agent. This ensures the same request path and reliability as chat.
	 *
	 * Uses the Chat API explicitly (openai.chat) so reasoning models like gpt-5-mini and
	 * gpt-5.2 get correct max_completion_tokens mapping. Also ensures the prompt
	 * explicitly contains "json" to satisfy OpenAI's requirement when using
	 * response_format: json_object.
	 */
	async generateStructuredOutput<T = unknown>(
		prompt: string,
		options: StructuredOutputOptions = {}
	): Promise<T> {
		const modelId = options.model || this.defaultModel;
		const temperature = options.temperature ?? this.defaultTemperature;
		const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

		try {
			// Use Chat API explicitly: reasoning models (gpt-5-mini, gpt-5.2) require
			// max_completion_tokens instead of max_tokens; the Chat provider handles this.
			const openaiWithKey = createOpenAI({ apiKey: this.apiKey });
			const model = openaiWithKey.chat(modelId as any);

			// OpenAI requires "json" in the message content when using response_format json_object.
			// Always prepend an explicit instruction so it appears in the user message.
			const lowerPrompt = prompt.toLowerCase();
			const hasJsonInstruction = lowerPrompt.includes("json");
			const finalPrompt = hasJsonInstruction
				? prompt
				: `Respond with valid JSON only.\n\n${prompt}`;
			const parsedSchema = parseStructuredSchema(options.schema);

			// Reasoning models (gpt-5-mini, gpt-5.2, etc.) do not support temperature
			console.log("[OpenAIProvider] Structured output request (AI SDK chat)", {
				model: modelId,
				maxTokens,
				promptLength: finalPrompt.length,
				hasSchema: Boolean(parsedSchema),
			});

			let result: Awaited<ReturnType<typeof generateText>>;
			if (parsedSchema) {
				try {
					// Prefer schema-enforced structured outputs for JSON-only pipeline steps.
					const requestWithSchema: Parameters<typeof generateText>[0] = {
						model,
						prompt: finalPrompt,
						maxOutputTokens: maxTokens,
						output: Output.json(),
						providerOptions: {
							openai: {
								responseFormat: {
									type: "json_schema",
									json_schema: {
										name: "structured_output",
										strict: true,
										schema: parsedSchema as any,
									},
								},
								response_format: {
									type: "json_schema",
									json_schema: {
										name: "structured_output",
										strict: true,
										schema: parsedSchema as any,
									},
								},
							},
						},
						...(!MODEL_CONFIG.isReasoningModel(modelId) && {
							temperature,
						}),
					};
					result = await generateText(requestWithSchema);
				} catch (schemaError) {
					console.warn(
						"[OpenAIProvider] Schema-structured output failed, falling back to json_object path:",
						schemaError
					);
					const fallbackRequest: Parameters<typeof generateText>[0] = {
						model,
						prompt: finalPrompt,
						maxOutputTokens: maxTokens,
						output: Output.json(),
						providerOptions: {
							openai: {
								responseFormat: { type: "json_object" },
								response_format: { type: "json_object" },
							},
						},
						...(!MODEL_CONFIG.isReasoningModel(modelId) && {
							temperature,
						}),
					};
					result = await generateText(fallbackRequest);
				}
			} else {
				const request: Parameters<typeof generateText>[0] = {
					model,
					prompt: finalPrompt,
					maxOutputTokens: maxTokens,
					output: Output.json(),
					providerOptions: {
						openai: {
							responseFormat: { type: "json_object" },
							response_format: { type: "json_object" },
						},
					},
					...(!MODEL_CONFIG.isReasoningModel(modelId) && {
						temperature,
					}),
				};
				result = await generateText(request);
			}

			const output = result.output;
			if (output === undefined || output === null) {
				throw new Error("OpenAI API returned empty structured output");
			}
			const tokens =
				(result.usage as { totalTokens?: number })?.totalTokens ??
				((result.usage as { promptTokens?: number })?.promptTokens ?? 0) +
					((result.usage as { completionTokens?: number })?.completionTokens ??
						0);
			if (tokens > 0 && options.onUsage) {
				await options.onUsage(
					{ tokens, queryCount: 1 },
					{ username: options.username, model: modelId }
				);
			}
			return output as T;
		} catch (error) {
			if (APICallError.isInstance(error)) {
				console.error(
					"[OpenAIProvider] Structured output API error:",
					error.statusCode,
					error.responseBody ?? "(no body)"
				);
			} else {
				console.error(
					"[OpenAIProvider] Error generating structured output:",
					error
				);
			}
			if (error instanceof LLMProviderAPIKeyError) {
				throw error;
			}
			throw new Error(
				`Failed to generate structured output: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
}
