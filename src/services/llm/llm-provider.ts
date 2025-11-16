/**
 * Options for LLM generation
 */
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Options for structured output generation
 */
export interface StructuredOutputOptions extends LLMOptions {
  schema?: string; // JSON schema as string for structured output
}

/**
 * Interface for LLM providers
 * Allows plugging in different LLM providers (OpenAI, Anthropic, etc.)
 */
export interface LLMProvider {
  /**
   * Generate a summary from a prompt
   * @param prompt - The prompt to generate from
   * @param options - Optional configuration for the generation
   * @returns The generated text
   */
  generateSummary(prompt: string, options?: LLMOptions): Promise<string>;

  /**
   * Generate structured output from a prompt
   * @param prompt - The prompt to generate from
   * @param options - Optional configuration including schema
   * @returns The generated structured object (parsed JSON)
   */
  generateStructuredOutput<T = unknown>(
    prompt: string,
    options?: StructuredOutputOptions
  ): Promise<T>;
}
