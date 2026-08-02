// Character Sheet Detection Service
// Detects if extracted text content is a character sheet (filetype & game-system agnostic)

import { z } from "zod";
import { getGenerationModelForProvider, MODEL_CONFIG } from "@/app-constants";
import type { EnvWithSecrets } from "@/lib/env-utils";
import { chunkTextByCharacterCount } from "@/lib/file/text-chunking-utils";
import type { LlmUsageReport } from "@/lib/llm-usage-breakdown";
import { isVerboseLlmSpendEnabled } from "@/lib/llm-usage-verbose-log";
import { formatCharacterSheetDetectionPrompt } from "@/lib/prompts/character-sheet-prompts";
import { parseOrThrow } from "@/lib/zod-utils";
import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import {
	type LlmResultCache,
	NOOP_LLM_RESULT_CACHE,
} from "@/services/llm/llm-result-cache";
import { logCharacterSheetDetection } from "./character-sheet-detection-telemetry";
import {
	classifyCharacterSheetAdvisory,
	classifyCharacterSheetDecisively,
} from "./character-sheet-indicators";

const DETECTION_CONFIDENCE_THRESHOLD = 0.7;
const MAX_CHUNK_SIZE = 10000; // Characters per chunk for detection

/**
 * Schema for character sheet detection result
 */
const CharacterSheetDetectionSchema = z.object({
	isCharacterSheet: z
		.boolean()
		.describe("Whether the content appears to be a character sheet"),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe("Confidence score from 0.0 to 1.0"),
	characterName: z
		.string()
		.nullish()
		.describe("The name of the character if detected, otherwise null"),
	detectedGameSystem: z
		.string()
		.nullish()
		.describe(
			"The game system if identifiable (e.g., 'D&D 5e', 'Pathfinder 2e', 'Call of Cthulhu'), otherwise null"
		),
	reasoning: z
		.string()
		.optional()
		.describe("Brief explanation of why it is or isn't a character sheet"),
});

export type CharacterSheetDetectionResult = z.infer<
	typeof CharacterSheetDetectionSchema
>;

/**
 * Service to detect if extracted text content is a character sheet.
 * Works on any file type (PDF, DOCX, Markdown, TXT, etc.) as long as text can be extracted.
 * Game-system agnostic - works with D&D, Pathfinder, Call of Cthulhu, etc.
 *
 * ## Why detection is still a separate call from parsing
 *
 * Issue #761 finding 5b proposes merging this with `CharacterSheetParserService`
 * into one SESSION_PLANNING call that returns `isCharacterSheet` alongside the
 * parsed data. Measured against what each pass actually costs, that trade is
 * negative:
 *
 * | Path | Today | Merged |
 * |---|---|---|
 * | True positive | ~7.5k tok on ANALYSIS + full doc on SESSION_PLANNING | full doc on SESSION_PLANNING |
 * | True negative | ~7.5k tok on ANALYSIS | **full doc on SESSION_PLANNING** |
 *
 * Detection caps its input at three 10,000-character chunks; parsing sends up to
 * 200,000 characters. So merging saves the detection pass — a few percent — on a
 * true positive, and pays roughly twenty times more on a true negative. Most
 * uploads are true negatives, which is the case the merge is worst for. "Returns
 * early on false" does not help: the early return saves output tokens, and the
 * cost here is input.
 *
 * The merge only becomes a win behind a pre-screen confident enough to route
 * *positives* deterministically, and `classifyCharacterSheetDecisively` only ever
 * short-circuits negatives — deliberately, since a wrong positive would create a
 * bogus PC entity. Promoting a positive rule needs the agreement data that
 * `character-sheet-detection-telemetry` now collects. Until then, two calls.
 */
export class CharacterSheetDetectionService {
	constructor(
		private llmApiKey: string,
		/**
		 * Content-addressed result cache (issue #761, finding 8). Detection runs on
		 * every uploaded file, so a re-upload or a retry of the same document is
		 * pure repeat spend. Defaults to the no-op cache so existing construction
		 * sites are unchanged.
		 */
		private resultCache: LlmResultCache = NOOP_LLM_RESULT_CACHE,
		/** Worker env, used only for the advisory-rule agreement log. */
		private env?: EnvWithSecrets | Record<string, unknown>
	) {}

	/**
	 * Detect if the provided text content is a character sheet
	 * Uses paging to analyze the full document without losing content
	 * @param textContent - Extracted text from any file type
	 * @param options - Optional username and onUsage for rate limit attribution
	 * @returns Detection result with confidence score and character name if found
	 */
	async detectCharacterSheet(
		textContent: string,
		options?: {
			username?: string;
			onUsage?: (usage: LlmUsageReport) => void | Promise<void>;
		}
	): Promise<CharacterSheetDetectionResult> {
		if (!textContent || textContent.trim().length === 0) {
			return this.notACharacterSheet("Empty or no content provided");
		}

		// Layer 1: rules that cannot be wrong, evaluated on the whole document
		// before it is chunked. Detection otherwise runs a model on every upload,
		// and most uploads are not character sheets (issue #761, finding 5a).
		const decisive = classifyCharacterSheetDecisively(textContent);
		if (decisive) {
			logCharacterSheetDetection(this.env, {
				source: "deterministic",
				isCharacterSheet: false,
				rule: decisive.rule,
				reason: decisive.reason,
				groupsMatched: decisive.groupsMatched,
				documentLength: textContent.length,
			});
			return this.notACharacterSheet(decisive.reason);
		}

		// Layer 2: the full rule set, evaluated but never routed on. Its agreement
		// with the model below is the measurement that decides what gets promoted.
		const advisory = classifyCharacterSheetAdvisory(textContent);

		const result = await this.detectViaModel(textContent, options);

		logCharacterSheetDetection(this.env, {
			source: "llm",
			isCharacterSheet: result.isCharacterSheet,
			advisoryVerdict: advisory.verdict,
			advisoryRule: advisory.rule,
			// `ambiguous` is a deferral, not a guess — scoring it as a disagreement
			// would understate how well the rules that do fire are doing.
			advisoryAgreed:
				advisory.verdict === "ambiguous"
					? undefined
					: (advisory.verdict === "character-sheet") ===
						result.isCharacterSheet,
			groupsMatched: advisory.groupsMatched,
			documentLength: textContent.length,
			model: getGenerationModelForProvider("ANALYSIS"),
		});

		return result;
	}

	/**
	 * The model-driven detection: one call for a small document, or up to three
	 * strategically chosen chunks for a large one, combined.
	 */
	private async detectViaModel(
		textContent: string,
		options?: {
			username?: string;
			onUsage?: (usage: LlmUsageReport) => void | Promise<void>;
		}
	): Promise<CharacterSheetDetectionResult> {
		// If content is small enough, analyze it directly
		if (textContent.length <= MAX_CHUNK_SIZE) {
			return await this.analyzeChunk(textContent, options);
		}

		// For larger content, split into chunks and analyze strategically
		const chunks = chunkTextByCharacterCount(textContent, MAX_CHUNK_SIZE);

		// Analyze key chunks: first, middle, and last (to catch indicators anywhere in the document)
		const chunksToAnalyze: Array<{ chunk: string; position: string }> = [];

		// Always analyze first chunk (most likely to have character name and basic info)
		chunksToAnalyze.push({ chunk: chunks[0], position: "beginning" });

		// Analyze middle chunk(s) if there are multiple chunks
		if (chunks.length > 2) {
			const middleIndex = Math.floor(chunks.length / 2);
			chunksToAnalyze.push({ chunk: chunks[middleIndex], position: "middle" });
		}

		// Analyze last chunk if there are multiple chunks (might have backstory, notes, etc.)
		if (chunks.length > 1) {
			chunksToAnalyze.push({
				chunk: chunks[chunks.length - 1],
				position: "end",
			});
		}

		// Analyze all selected chunks
		const results: CharacterSheetDetectionResult[] = [];
		for (const { chunk } of chunksToAnalyze) {
			try {
				const result = await this.analyzeChunk(chunk, options);
				results.push(result);
			} catch (_error) {
				// Continue with other chunks even if one fails
			}
		}

		// Combine results from all chunks
		return this.combineDetectionResults(results);
	}

	/**
	 * Analyze a single chunk of text for character sheet detection
	 */
	private async analyzeChunk(
		chunkContent: string,
		options?: {
			username?: string;
			onUsage?: (usage: LlmUsageReport) => void | Promise<void>;
		}
	): Promise<CharacterSheetDetectionResult> {
		const includeReasoning = isVerboseLlmSpendEnabled();
		const prompt = formatCharacterSheetDetectionPrompt(chunkContent, {
			includeReasoning,
		});

		// Rendering the prompt with empty content gives the exact instruction text
		// this call will send, including the reasoning branch, so a prompt edit
		// invalidates the cache without anyone having to bump a version.
		const { value } = await this.resultCache.getOrCompute<
			CharacterSheetDetectionResult | undefined
		>(
			{
				kind: "character_sheet_detection",
				model: getGenerationModelForProvider("ANALYSIS"),
				promptPrefix: formatCharacterSheetDetectionPrompt("", {
					includeReasoning,
				}),
				variablePart: chunkContent,
			},
			() => this.callDetectionModel(prompt, options)
		);

		return (
			value ?? this.notACharacterSheet("Model returned no structured output")
		);
	}

	/**
	 * The model call itself, split out so the cache wraps exactly one thing.
	 *
	 * Returns undefined rather than a result when the model produced no output:
	 * that is a transient failure, and caching it would make one bad response
	 * permanent for that document.
	 */
	private async callDetectionModel(
		prompt: string,
		options?: {
			username?: string;
			onUsage?: (usage: LlmUsageReport) => void | Promise<void>;
		}
	): Promise<CharacterSheetDetectionResult | undefined> {
		const llmProvider = createLLMProvider({
			provider: MODEL_CONFIG.PROVIDER.DEFAULT,
			apiKey: this.llmApiKey,
			// Use centralized analysis model for efficient detection
			defaultModel: getGenerationModelForProvider("ANALYSIS"),
			defaultTemperature: 0.1,
			defaultMaxTokens: 500,
		});

		try {
			const result =
				await llmProvider.generateStructuredOutput<CharacterSheetDetectionResult>(
					prompt,
					{
						model: getGenerationModelForProvider("ANALYSIS"),
						temperature: 0.1,
						maxTokens: 500,
						username: options?.username,
						onUsage: options?.onUsage,
					}
				);

			// Validate against schema (LLM output may be malformed)
			return parseOrThrow(CharacterSheetDetectionSchema, result, {
				logPrefix: "[CharacterSheetDetection]",
				messagePrefix: "Invalid detection result",
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";
			const isNoOutput =
				errorMessage.includes("No output generated") ||
				errorMessage.includes("AI_NoOutputGeneratedError");

			// No output from model: treat as "not a character sheet", continue with normal extraction
			if (isNoOutput) {
				return undefined;
			}
			throw error;
		}
	}

	/** The conservative answer, used whenever there is nothing to judge. */
	private notACharacterSheet(reasoning: string): CharacterSheetDetectionResult {
		return {
			isCharacterSheet: false,
			confidence: 0,
			characterName: undefined,
			detectedGameSystem: undefined,
			reasoning,
		};
	}

	/**
	 * Combine detection results from multiple chunks
	 * Uses the highest confidence result if any chunk detected a character sheet,
	 * otherwise averages confidences
	 */
	private combineDetectionResults(
		results: CharacterSheetDetectionResult[]
	): CharacterSheetDetectionResult {
		if (results.length === 0) {
			return {
				isCharacterSheet: false,
				confidence: 0,
				characterName: undefined,
				detectedGameSystem: undefined,
				reasoning: "No chunks analyzed",
			};
		}

		if (results.length === 1) {
			return results[0];
		}

		// If any chunk detected a character sheet with reasonable confidence, use that
		const positiveResults = results.filter(
			(r) => r.isCharacterSheet && r.confidence >= 0.5
		);

		if (positiveResults.length > 0) {
			// Use the highest confidence positive result
			const bestPositive = positiveResults.reduce((best, current) =>
				current.confidence > best.confidence ? current : best
			);

			// Combine character names (prefer non-null, take first if multiple)
			const characterNames = positiveResults
				.map((r) => r.characterName)
				.filter((name): name is string => !!name);
			const combinedCharacterName =
				characterNames.length > 0 ? characterNames[0] : undefined;

			// Combine game systems (prefer non-null, take first if multiple)
			const gameSystems = positiveResults
				.map((r) => r.detectedGameSystem)
				.filter((system): system is string => !!system);
			const combinedGameSystem =
				gameSystems.length > 0 ? gameSystems[0] : undefined;

			// Combine reasoning
			const combinedReasoning = positiveResults
				.map((r) => r.reasoning)
				.filter((r): r is string => !!r)
				.join("; ");

			return {
				isCharacterSheet: true,
				confidence: bestPositive.confidence,
				characterName: combinedCharacterName,
				detectedGameSystem: combinedGameSystem,
				reasoning: combinedReasoning || bestPositive.reasoning,
			};
		}

		// If no chunk detected a character sheet, average the confidences
		const avgConfidence =
			results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

		return {
			isCharacterSheet: false,
			confidence: avgConfidence,
			characterName: undefined,
			detectedGameSystem: undefined,
			reasoning: `Analyzed ${results.length} chunks, none detected a character sheet`,
		};
	}

	/**
	 * Check if detection result meets confidence threshold
	 */
	isConfidentDetection(result: CharacterSheetDetectionResult): boolean {
		return (
			result.isCharacterSheet &&
			result.confidence >= DETECTION_CONFIDENCE_THRESHOLD
		);
	}
}
