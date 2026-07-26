import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type ModelMessage } from "ai";
import { MODEL_CONFIG } from "@/app-constants";
import { anthropicSamplingParams } from "@/lib/anthropic-model-options";
import { LLMProviderAPIKeyError } from "@/lib/errors";
import { repairJsonDeterministically } from "@/lib/json-repair";
import { describeLlmFailure, wrapLlmError } from "@/lib/llm-error-utils";
import {
	buildStructuredCacheablePrefix,
	extractJsonObjectText,
	parseStructuredSchema,
	STRUCTURED_JSON_INTRO,
	structuredSchemaInstructions,
} from "@/lib/llm-structured-output";
import {
	addTokenBreakdowns,
	toTokenBreakdown,
	totalUsageTokens,
} from "@/lib/llm-usage-breakdown";
import { warnIfCacheablePrefixTooShort } from "@/lib/prompt-cache-guard";
import type {
	LLMOptions,
	LLMProvider,
	StructuredOutputOptions,
	StructuredPromptParts,
} from "./llm-provider";

const getUsageTokens = totalUsageTokens;

/**
 * Build the cached-prefix + variable-suffix user message.
 *
 * The breakpoint goes on the first text part; everything before it is what the
 * API hashes. Anything identical across calls (the JSON schema block) belongs
 * inside `cacheablePrefixText` — in the variable suffix it would both shorten
 * the prefix and be re-billed on every call.
 */
function buildCachedMessage(
	parts: StructuredPromptParts,
	cacheablePrefixText: string
): ModelMessage {
	return {
		role: "user",
		content: [
			{
				type: "text",
				text: cacheablePrefixText,
				providerOptions: {
					anthropic: {
						cacheControl: { type: "ephemeral" },
					},
				},
			},
			{
				type: "text",
				text: parts.variableSuffix,
			},
		],
	};
}

/**
 * Choose between a single prompt and cached message parts.
 *
 * The schema block goes inside the cached prefix: it is identical on every
 * call, so in the variable suffix it would both shorten the prefix and be
 * re-billed each time.
 */
function buildStructuredInput(
	prompt: string,
	parsedSchema: Record<string, unknown> | null,
	modelId: string,
	options: StructuredOutputOptions
): { messages: ModelMessage[] } | { prompt: string } {
	const parts = options.structuredPromptParts;
	if (!parts) {
		return {
			prompt: `${STRUCTURED_JSON_INTRO}\n\n${prompt}${structuredSchemaInstructions(parsedSchema)}`,
		};
	}

	const cacheableFull = buildStructuredCacheablePrefix(
		parts.cacheablePrefix,
		parsedSchema
	);
	warnIfCacheablePrefixTooShort(undefined, modelId, cacheableFull, {
		method: "generateStructuredOutput",
	});
	return { messages: [buildCachedMessage(parts, cacheableFull)] };
}

/** Substrings JSON.parse failures carry across runtimes. */
const JSON_PARSE_ERROR_MARKERS = [
	"Expected ','",
	"Expected ']'",
	"Expected '}'",
	"JSON at position",
	"Unexpected end of JSON input",
];

/** True when the failure is malformed JSON rather than a transport/API error. */
function isJsonParseFailure(error: unknown, errorMessage: string): boolean {
	if (error instanceof SyntaxError) return true;
	return JSON_PARSE_ERROR_MARKERS.some((marker) =>
		errorMessage.includes(marker)
	);
}

/** Prompt for the LLM repair pass, used only when local repair cannot fix the JSON. */
function buildJsonRepairPrompt(
	jsonText: string,
	parsedSchema: Record<string, unknown> | null,
	parseError: unknown
): string {
	const fence = "`".repeat(3);
	return [
		"You are a JSON repair assistant.",
		"Fix the JSON so it is strictly valid JSON and preserves semantics.",
		"Do not add markdown fences, comments, or explanatory text.",
		"Return only the repaired JSON object.",
		parsedSchema ? `Target schema:\n${JSON.stringify(parsedSchema)}` : "",
		`Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
		"Malformed JSON:",
		fence,
		truncateForPrompt(jsonText, 50000),
		fence,
	]
		.filter(Boolean)
		.join("\n\n");
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
			const sampling = anthropicSamplingParams(modelId, temperature);

			const parts = options.structuredPromptParts;
			if (parts) {
				warnIfCacheablePrefixTooShort(
					undefined,
					modelId,
					parts.cacheablePrefix,
					{ method: "generateSummary" }
				);
			}

			const result = await generateText({
				model,
				...(parts
					? { messages: [buildCachedMessage(parts, parts.cacheablePrefix)] }
					: { prompt }),
				...sampling,
				maxOutputTokens: maxTokens,
				...(options.maxRetries != null
					? { maxRetries: options.maxRetries }
					: {}),
				...(options.timeout != null ? { timeout: options.timeout } : {}),
			});

			const text = result.text;
			if (text === undefined || text === null || text.trim().length === 0) {
				throw new Error(
					`Anthropic API returned empty response (model ${modelId}, finishReason ${result.finishReason ?? "unknown"})`
				);
			}

			const tokens = getUsageTokens(result.usage);
			if (tokens > 0 && options.onUsage) {
				await options.onUsage(
					{
						tokens,
						queryCount: 1,
						...toTokenBreakdown(result.usage, result.providerMetadata),
					},
					{ username: options.username, model: modelId }
				);
			}
			return text;
		} catch (error) {
			if (error instanceof LLMProviderAPIKeyError) {
				throw error;
			}
			const detail = describeLlmFailure(error);
			throw wrapLlmError(`Failed to generate summary: ${detail}`, error);
		}
	}

	/**
	 * Parse the model's JSON, repairing it if needed.
	 *
	 * Repair is layered cheapest-first: a deterministic local pass runs before
	 * the LLM repair call, which resends up to 50,000 characters of malformed
	 * JSON and pays 5x input price for the regenerated output.
	 *
	 * `repairTokens` is undefined when no LLM repair call was made — including
	 * when the deterministic pass succeeded, which is the case that saves money.
	 */
	private async parseOrRepairJson<T>(
		jsonText: string,
		ctx: {
			model: ReturnType<ReturnType<typeof createAnthropic>>;
			modelId: string;
			maxTokens: number;
			parsedSchema: Record<string, unknown> | null;
			onJsonRepair?: () => void | Promise<void>;
		}
	): Promise<{
		output: T;
		repairTokens?: number;
		repairBreakdown?: ReturnType<typeof toTokenBreakdown>;
	}> {
		try {
			return { output: JSON.parse(jsonText) as T };
		} catch (parseError) {
			await ctx.onJsonRepair?.();

			// Trailing commas, raw newlines in strings, and tails truncated by the
			// output cap are all fixable locally. Only fall through to a second LLM
			// call when they are not.
			const deterministic = repairJsonDeterministically(jsonText);
			if (deterministic !== null) {
				return { output: JSON.parse(deterministic) as T };
			}

			const repairResult = await generateText({
				model: ctx.model,
				prompt: buildJsonRepairPrompt(jsonText, ctx.parsedSchema, parseError),
				...anthropicSamplingParams(ctx.modelId, 0),
				maxOutputTokens: Math.max(ctx.maxTokens, 3000),
			});

			const repairedText = extractJsonObjectText(repairResult.text || "");
			if (!repairedText) {
				throw new Error("Anthropic API returned unrecoverable malformed JSON");
			}
			return {
				output: JSON.parse(repairedText) as T,
				repairTokens: getUsageTokens(repairResult.usage),
				repairBreakdown: toTokenBreakdown(
					repairResult.usage,
					repairResult.providerMetadata
				),
			};
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

		const anthropic = createAnthropic({ apiKey: this.apiKey });
		const model = anthropic(modelId as any);
		const input = buildStructuredInput(prompt, parsedSchema, modelId, options);

		try {
			const sampling = anthropicSamplingParams(modelId, temperature);
			const result = await generateText({
				model,
				...input,
				...sampling,
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
			const parsed = await this.parseOrRepairJson<T>(jsonText, {
				model,
				modelId,
				maxTokens,
				parsedSchema,
				onJsonRepair: options.onJsonRepair,
			});
			const output = parsed.output;
			const repairBreakdown = parsed.repairBreakdown;

			const tokens = getUsageTokens(result.usage) + (parsed.repairTokens ?? 0);
			const queryCount = parsed.repairTokens === undefined ? 1 : 2;
			if (tokens > 0 && options.onUsage) {
				await options.onUsage(
					{
						tokens,
						queryCount,
						// A JSON-repair retry is real spend on the same intent — fold it
						// into the same event rather than losing it.
						...addTokenBreakdowns(
							toTokenBreakdown(result.usage, result.providerMetadata),
							repairBreakdown
						),
					},
					{ username: options.username, model: modelId }
				);
			}
			return output as T;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// Surface malformed JSON as "no object generated" so extraction can
			// treat this chunk as empty instead of triggering expensive retries.
			if (isJsonParseFailure(error, errorMessage)) {
				throw new Error(
					"AI_NoObjectGeneratedError: could not parse the response as JSON"
				);
			}
			throw new Error(`Failed to generate structured output: ${errorMessage}`);
		}
	}
}
