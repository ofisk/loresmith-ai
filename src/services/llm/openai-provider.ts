import type {
  LLMProvider,
  LLMOptions,
  StructuredOutputOptions,
} from "./llm-provider";
import { OpenAIAPIKeyError } from "@/lib/errors";
import { MODEL_CONFIG } from "@/app-constants";

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

  async generateSummary(
    prompt: string,
    options: LLMOptions = {}
  ): Promise<string> {
    const model = options.model || this.defaultModel;
    const temperature = options.temperature ?? this.defaultTemperature;
    const maxTokens = options.maxTokens ?? this.defaultMaxTokens;
    const usesCompletionTokensParam = model.startsWith("gpt-5");

    try {
      const requestBody: any = {
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
      };

      if (usesCompletionTokensParam) {
        requestBody.max_completion_tokens = maxTokens;
      } else {
        requestBody.max_tokens = maxTokens;
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
    const usesCompletionTokensParam = model.startsWith("gpt-5");

    try {
      // For structured output, use JSON mode via response_format
      const requestBody: any = {
        model,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
      };

      if (usesCompletionTokensParam) {
        requestBody.max_completion_tokens = maxTokens;
      } else {
        requestBody.max_tokens = maxTokens;
      }

      // Use JSON mode for structured output (supported by GPT-4o and newer models)
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

      // Log high-level request metadata (but NOT the full prompt) to help debug 4xxs
      try {
        console.log("[OpenAIProvider] Structured output request", {
          model,
          temperature,
          maxTokens,
          promptLength: prompt.length,
          hasJsonInstruction,
          messageCount: requestBody.messages.length,
          requestBodySize: JSON.stringify(requestBody).length,
        });
      } catch {
        // best-effort logging only
      }

      const doRequest = async (body: any, context: { isFallback: boolean }) => {
        const response = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
          }
        );

        if (!response.ok) {
          // Capture request ID for correlation with OpenAI logs/support
          const requestId =
            response.headers.get("x-request-id") ||
            response.headers.get("openai-request-id") ||
            null;

          const errorText = await response.text();

          // Try to parse standard OpenAI error envelope for richer logging
          let parsedError: {
            error?: {
              message?: string;
              type?: string;
              code?: string | null;
              param?: string | null;
            };
          } | null = null;

          try {
            parsedError = JSON.parse(errorText) as {
              error?: {
                message?: string;
                type?: string;
                code?: string | null;
                param?: string | null;
              };
            };
            console.error("[OpenAIProvider] Structured output HTTP error", {
              status: response.status,
              statusText: response.statusText,
              message: parsedError?.error?.message,
              type: parsedError?.error?.type,
              code: parsedError?.error?.code,
              param: parsedError?.error?.param,
              requestId,
              isFallback: context.isFallback,
            });
          } catch {
            console.error(
              "[OpenAIProvider] Structured output HTTP error (unparsed body)",
              {
                status: response.status,
                statusText: response.statusText,
                requestId,
                isFallback: context.isFallback,
                bodyPreview: errorText.slice(0, 500),
              }
            );
          }

          const isGeneric400 =
            response.status === 400 &&
            (!parsedError?.error?.message ||
              parsedError.error.message === "Bad Request") &&
            !parsedError?.error?.type &&
            !parsedError?.error?.code;

          // Log exact request body for reproduction (curl / OpenAI support) when we see generic 400.
          // Cap logged payload size to avoid exceeding Cloudflare Workers 256KB log limit.
          const REPRODUCTION_PAYLOAD_MAX_LOG_BYTES = 100 * 1024; // 100KB
          if (isGeneric400) {
            const payloadJson = JSON.stringify(body);
            const payloadBytes = new TextEncoder().encode(payloadJson).length;
            const label = context.isFallback
              ? "no JSON mode (fallback)"
              : "JSON mode";
            console.warn(
              `[OpenAIProvider] Reproduction payload (requestId: ${requestId}, ${label}). Save the JSON below to a file (e.g. payload.json) and run: curl -X POST https://api.openai.com/v1/chat/completions -H "Authorization: Bearer \\$OPENAI_API_KEY" -H "Content-Type: application/json" -d @payload.json`
            );
            if (payloadBytes <= REPRODUCTION_PAYLOAD_MAX_LOG_BYTES) {
              console.warn(
                "[OpenAIProvider] --- BEGIN REPRODUCTION PAYLOAD ---"
              );
              console.warn(payloadJson);
              console.warn("[OpenAIProvider] --- END REPRODUCTION PAYLOAD ---");
            } else {
              console.warn(
                `[OpenAIProvider] Payload too large to log (${payloadBytes} bytes > ${REPRODUCTION_PAYLOAD_MAX_LOG_BYTES}). Use requestId ${requestId} to correlate; attach request body from application code if needed.`
              );
            }
          }

          // If JSON mode appears to be triggering a generic 400, retry once without response_format
          if (
            !context.isFallback &&
            isGeneric400 &&
            body.response_format !== undefined
          ) {
            console.warn(
              "[OpenAIProvider] Structured output generic 400 in JSON mode, retrying without response_format",
              {
                model,
                maxTokens,
                requestId,
              }
            );
            const fallbackBody: any = { ...body };
            delete fallbackBody.response_format;
            return doRequest(fallbackBody, { isFallback: true });
          }

          throw new Error(
            `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
          );
        }

        return (await response.json()) as any;
      };

      const result = await doRequest(requestBody, { isFallback: false });
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
