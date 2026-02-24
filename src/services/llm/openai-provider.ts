import type {
  LLMProvider,
  LLMOptions,
  StructuredOutputOptions,
} from "./llm-provider";
import { OpenAIAPIKeyError } from "@/lib/errors";
import { MODEL_CONFIG } from "@/app-constants";
import { generateText, APICallError } from "ai";
import { Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

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
      throw new OpenAIAPIKeyError();
    }

    this.apiKey = apiKey;
    // Default to centralized primary model for general-purpose calls; callers can override per-use.
    this.defaultModel = options.defaultModel || MODEL_CONFIG.OPENAI.PRIMARY;
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

      const result = await generateText({
        model,
        prompt,
        temperature,
        maxOutputTokens: maxTokens,
      });

      const text = result.text;
      if (text === undefined || text === null) {
        throw new Error("OpenAI API returned empty response");
      }
      return text;
    } catch (error) {
      console.error("[OpenAIProvider] Error generating summary:", error);
      if (error instanceof OpenAIAPIKeyError) {
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

      console.log("[OpenAIProvider] Structured output request (AI SDK chat)", {
        model: modelId,
        temperature,
        maxTokens,
        promptLength: finalPrompt.length,
      });

      const result = await generateText({
        model,
        prompt: finalPrompt,
        temperature,
        maxOutputTokens: maxTokens,
        output: Output.json(),
      });

      const output = result.output;
      if (output === undefined || output === null) {
        throw new Error("OpenAI API returned empty structured output");
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
      if (error instanceof OpenAIAPIKeyError) {
        throw error;
      }
      throw new Error(
        `Failed to generate structured output: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
