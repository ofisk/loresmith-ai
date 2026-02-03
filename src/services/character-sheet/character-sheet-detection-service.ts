// Character Sheet Detection Service
// Detects if extracted text content is a character sheet (filetype & game-system agnostic)

import { createLLMProvider } from "@/services/llm/llm-provider-factory";
import { z } from "zod";
import { parseOrThrow } from "@/lib/zod-utils";
import { chunkTextByCharacterCount } from "@/lib/text-chunking-utils";
import { formatCharacterSheetDetectionPrompt } from "@/lib/prompts/character-sheet-prompts";

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
    .optional()
    .describe("The name of the character if detected, otherwise null"),
  detectedGameSystem: z
    .string()
    .optional()
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
 */
export class CharacterSheetDetectionService {
  constructor(private openaiApiKey: string) {}

  /**
   * Detect if the provided text content is a character sheet
   * Uses paging to analyze the full document without losing content
   * @param textContent - Extracted text from any file type
   * @returns Detection result with confidence score and character name if found
   */
  async detectCharacterSheet(
    textContent: string
  ): Promise<CharacterSheetDetectionResult> {
    if (!textContent || textContent.trim().length === 0) {
      return {
        isCharacterSheet: false,
        confidence: 0,
        characterName: undefined,
        detectedGameSystem: undefined,
        reasoning: "Empty or no content provided",
      };
    }

    // If content is small enough, analyze it directly
    if (textContent.length <= MAX_CHUNK_SIZE) {
      return await this.analyzeChunk(textContent);
    }

    // For larger content, split into chunks and analyze strategically
    const chunks = chunkTextByCharacterCount(textContent, MAX_CHUNK_SIZE);
    console.log(
      `[CharacterSheetDetection] Analyzing ${chunks.length} chunk(s) for character sheet detection`
    );

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
    for (const { chunk, position } of chunksToAnalyze) {
      try {
        const result = await this.analyzeChunk(chunk);
        results.push(result);
        console.log(
          `[CharacterSheetDetection] ${position} chunk: isCharacterSheet=${result.isCharacterSheet}, confidence=${result.confidence}`
        );
      } catch (error) {
        console.warn(
          `[CharacterSheetDetection] Error analyzing ${position} chunk:`,
          error
        );
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
    chunkContent: string
  ): Promise<CharacterSheetDetectionResult> {
    const prompt = formatCharacterSheetDetectionPrompt(chunkContent);

    const llmProvider = createLLMProvider({
      provider: "openai",
      apiKey: this.openaiApiKey,
      defaultModel: "gpt-4o-mini", // Use cheaper model for detection
      defaultTemperature: 0.1,
      defaultMaxTokens: 500,
    });

    const result =
      await llmProvider.generateStructuredOutput<CharacterSheetDetectionResult>(
        prompt,
        {
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 500,
        }
      );

    // Validate against schema (LLM output may be malformed)
    return parseOrThrow(CharacterSheetDetectionSchema, result, {
      logPrefix: "[CharacterSheetDetection]",
      messagePrefix: "Invalid detection result",
    });
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
