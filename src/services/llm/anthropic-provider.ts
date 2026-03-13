import { createAnthropic } from "@ai-sdk/anthropic";
import { APICallError, generateText } from "ai";
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

function getUsageTokens(usage: unknown): number {
	const typed = usage as
		| {
				totalTokens?: number;
				inputTokens?: number;
				outputTokens?: number;
		  }
		| undefined;
	return (
		typed?.totalTokens ?? (typed?.inputTokens ?? 0) + (typed?.outputTokens ?? 0)
	);
}

function stripMarkdownCodeFence(text: string): string {
	const trimmed = text.trim();
	const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
	return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function extractJsonObjectText(text: string): string | null {
	const stripped = stripMarkdownCodeFence(text);
	const firstBrace = stripped.indexOf("{");
	const lastBrace = stripped.lastIndexOf("}");
	if (firstBrace >= 0 && lastBrace > firstBrace) {
		return stripped.slice(firstBrace, lastBrace + 1);
	}
	return null;
}

function truncateForPrompt(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, maxChars)}\n/* truncated */`;
}

/**
 * Anthropic provider implementation for LLM generation.
 */
export class AnthropicProvider implements LLMProvider {
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
			throw new LLMProviderAPIKeyError(
				"Anthropic API key is required. Configure ANTHROPIC_API_KEY on the server."
			);
		}

		this.apiKey = apiKey;
		this.defaultModel =
			options.defaultModel || MODEL_CONFIG.ANTHROPIC.INTERACTIVE;
		this.defaultTemperature = options.defaultTemperature ?? 0.3;
		this.defaultMaxTokens = options.defaultMaxTokens ?? 2000;
	}

	async generateSummary(
		prompt: string,
		options: LLMOptions = {}
	): Promise<string> {
		const modelId = options.model || this.defaultModel;
		const temperature = options.temperature ?? this.defaultTemperature;
		const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

		try {
			const anthropic = createAnthropic({ apiKey: this.apiKey });
			const model = anthropic(modelId as any);
			const result = await generateText({
				model,
				prompt,
				temperature,
				maxOutputTokens: maxTokens,
			});

			const text = result.text;
			if (text === undefined || text === null) {
				throw new Error("Anthropic API returned empty response");
			}

			const tokens = getUsageTokens(result.usage);
			if (tokens > 0 && options.onUsage) {
				await options.onUsage(
					{ tokens, queryCount: 1 },
					{ username: options.username, model: modelId }
				);
			}
			return text;
		} catch (error) {
			throw new Error(
				`Failed to generate summary: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async generateStructuredOutput<T = unknown>(
		prompt: string,
		options: StructuredOutputOptions = {}
	): Promise<T> {
		const modelId = options.model || this.defaultModel;
		const temperature = options.temperature ?? this.defaultTemperature;
		const maxTokens = options.maxTokens ?? this.defaultMaxTokens;
		const parsedSchema = parseStructuredSchema(options.schema);
		const schemaInstructions = parsedSchema
			? `\n\nYou MUST return JSON that conforms to this JSON Schema:\n${JSON.stringify(parsedSchema)}`
			: "";
		const finalPrompt = `Respond with valid JSON only. Do not wrap the JSON in markdown fences.\n\n${prompt}${schemaInstructions}`;

		const anthropic = createAnthropic({ apiKey: this.apiKey });
		const model = anthropic(modelId as any);
		try {
			const result = await generateText({
				model,
				prompt: finalPrompt,
				temperature,
				maxOutputTokens: maxTokens,
			});

			const rawText = result.text;
			if (!rawText || rawText.trim().length === 0) {
				throw new Error("Anthropic API returned empty structured output");
			}
			const jsonText = extractJsonObjectText(rawText);
			if (!jsonText) {
				throw new Error("Anthropic API returned non-JSON structured output");
			}
			let output: T;
			try {
				output = JSON.parse(jsonText) as T;
			} catch (parseError) {
				// Anthropic occasionally returns near-valid JSON (e.g. missing commas
				// or malformed string escaping). Try one constrained repair pass.
				const repairPrompt = [
					"You are a JSON repair assistant.",
					"Fix the JSON so it is strictly valid JSON and preserves semantics.",
					"Do not add markdown fences, comments, or explanatory text.",
					"Return only the repaired JSON object.",
					parsedSchema ? `Target schema:\n${JSON.stringify(parsedSchema)}` : "",
					`Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
					"Malformed JSON:",
					"```",
					truncateForPrompt(jsonText, 50000),
					"```",
				]
					.filter(Boolean)
					.join("\n\n");

				const repairResult = await generateText({
					model,
					prompt: repairPrompt,
					temperature: 0,
					maxOutputTokens: Math.max(maxTokens, 3000),
				});

				const repairedText = extractJsonObjectText(repairResult.text || "");
				if (!repairedText) {
					throw new Error(
						"Anthropic API returned unrecoverable malformed JSON"
					);
				}
				output = JSON.parse(repairedText) as T;
			}

			const tokens = getUsageTokens(result.usage);
			if (tokens > 0 && options.onUsage) {
				await options.onUsage(
					{ tokens, queryCount: 1 },
					{ username: options.username, model: modelId }
				);
			}
			return output as T;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const isJsonParseFailure =
				error instanceof SyntaxError ||
				errorMessage.includes("Expected ','") ||
				errorMessage.includes("Expected ']'") ||
				errorMessage.includes("Expected '}'") ||
				errorMessage.includes("JSON at position") ||
				errorMessage.includes("Unexpected end of JSON input");

			// Surface malformed JSON as "no object generated" so extraction can
			// treat this chunk as empty instead of triggering expensive retries.
			if (isJsonParseFailure) {
				throw new Error(
					"AI_NoObjectGeneratedError: could not parse the response as JSON"
				);
			}

			if (APICallError.isInstance(error)) {
			} else {
			}
			throw new Error(`Failed to generate structured output: ${errorMessage}`);
		}
	}
}
