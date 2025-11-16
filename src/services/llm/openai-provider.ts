import type {
  LLMProvider,
  LLMOptions,
  StructuredOutputOptions,
} from "./llm-provider";
import { OpenAIAPIKeyError } from "@/lib/errors";

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
    this.defaultModel = options.defaultModel || "gpt-4o-mini";
    this.defaultTemperature = options.defaultTemperature ?? 0.3;
    this.defaultMaxTokens = options.defaultMaxTokens ?? 2000;
  }

  async generateSummary(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<string> {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature,
            max_tokens: maxTokens,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = (await response.json()) as any;
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("OpenAI API returned empty response");
      }

      return content;
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

  async generateStructuredOutput<T = unknown>(
    prompt: string,
    options: StructuredOutputOptions = {}
  ): Promise<T> {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;

    try {
      // For structured output, use response_format with JSON schema
      const requestBody: any = {
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
        max_tokens: maxTokens,
      };

      // Use JSON mode for structured output (GPT-4o and newer models support this)
      // OpenAI's JSON mode requires the prompt to explicitly request JSON format
      requestBody.response_format = { type: "json_object" };

      // Ensure prompt includes instruction to return JSON if not already present
      const lowerPrompt = prompt.toLowerCase();
      const hasJsonInstruction =
        lowerPrompt.includes("json") ||
        lowerPrompt.includes("return a json") ||
        lowerPrompt.includes("output json") ||
        lowerPrompt.includes("respond with json");

      if (!hasJsonInstruction) {
        requestBody.messages[0].content = `${prompt}\n\nPlease respond with valid JSON only.`;
      }

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = (await response.json()) as any;
      const content = result.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("OpenAI API returned empty response");
      }

      // Parse JSON response
      try {
        const parsed = JSON.parse(content);
        return parsed as T;
      } catch (parseError) {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]) as T;
        }
        throw new Error(
          `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Invalid JSON"}`
        );
      }
    } catch (error) {
      console.error(
        "[OpenAIProvider] Error generating structured output:",
        error
      );
      if (error instanceof OpenAIAPIKeyError) {
        throw error;
      }
      throw new Error(
        `Failed to generate structured output: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}
