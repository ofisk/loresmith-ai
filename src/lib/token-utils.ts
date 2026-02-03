/**
 * Token estimation and context management utilities
 *
 * Uses a conservative estimate of ~4 characters per token for English text.
 * This is a rough approximation - actual token counts may vary.
 */

// Conservative token estimation: ~4 characters per token for English text
const CHARS_PER_TOKEN = 4;

// Model context limits (in tokens)
export const MODEL_CONTEXT_LIMITS = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4": 8192,
  "gpt-4-turbo": 128000,
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,
} as const;

// Safety margin: use 90% of context limit to avoid edge cases
const CONTEXT_SAFETY_MARGIN = 0.9;

/**
 * Estimate token count for a string
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a message object
 */
export function estimateMessageTokens(message: any): number {
  let tokens = 0;

  // Role overhead (~1 token)
  if (message.role) {
    tokens += 1;
  }

  // Content tokens
  if (typeof message.content === "string") {
    tokens += estimateTokenCount(message.content);
  } else if (Array.isArray(message.content)) {
    // Handle multimodal content
    for (const part of message.content) {
      if (typeof part === "string") {
        tokens += estimateTokenCount(part);
      } else if (part?.type === "text" && typeof part.text === "string") {
        tokens += estimateTokenCount(part.text);
      }
    }
  }

  // Tool calls overhead (rough estimate)
  if (message.toolCalls && Array.isArray(message.toolCalls)) {
    tokens += message.toolCalls.length * 50; // ~50 tokens per tool call
  }

  // Tool results overhead (rough estimate)
  if (message.toolInvocations && Array.isArray(message.toolInvocations)) {
    for (const invocation of message.toolInvocations) {
      tokens += 20; // Base overhead
      if (invocation.result) {
        const resultStr =
          typeof invocation.result === "string"
            ? invocation.result
            : JSON.stringify(invocation.result);
        tokens += estimateTokenCount(resultStr);
      }
    }
  }

  return tokens;
}

/**
 * Estimate total token count for messages array
 */
export function estimateMessagesTokens(messages: any[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/**
 * Estimate token count for tools (function definitions)
 */
export function estimateToolsTokens(tools: Record<string, any>): number {
  let tokens = 0;

  for (const [toolName, tool] of Object.entries(tools)) {
    // Tool name
    tokens += estimateTokenCount(toolName);

    // Tool description
    if (tool.description) {
      tokens += estimateTokenCount(tool.description);
    }

    // Tool parameters/schema (v5: parameters, v6: inputSchema)
    const schema =
      (tool as { inputSchema?: unknown; parameters?: unknown }).inputSchema ??
      tool.parameters;
    if (schema) {
      const schemaStr = JSON.stringify(schema);
      tokens += estimateTokenCount(schemaStr);
    }
  }

  return tokens;
}

/**
 * Get context limit for a model
 */
export function getModelContextLimit(modelId: string | undefined): number {
  if (!modelId) {
    // Default to gpt-4o limit if unknown
    return MODEL_CONTEXT_LIMITS["gpt-4o"];
  }

  // Check for exact match
  if (modelId in MODEL_CONTEXT_LIMITS) {
    return MODEL_CONTEXT_LIMITS[modelId as keyof typeof MODEL_CONTEXT_LIMITS];
  }

  // Check for model prefix matches
  if (modelId.startsWith("gpt-4o")) {
    return MODEL_CONTEXT_LIMITS["gpt-4o"];
  }
  if (modelId.startsWith("gpt-4-turbo")) {
    return MODEL_CONTEXT_LIMITS["gpt-4-turbo"];
  }
  if (modelId.startsWith("gpt-4")) {
    return MODEL_CONTEXT_LIMITS["gpt-4"];
  }
  if (modelId.startsWith("gpt-3.5-turbo")) {
    return MODEL_CONTEXT_LIMITS["gpt-3.5-turbo"];
  }

  // Default to gpt-4o limit
  return MODEL_CONTEXT_LIMITS["gpt-4o"];
}

/**
 * Calculate safe context limit (with safety margin)
 */
export function getSafeContextLimit(modelId: string | undefined): number {
  const limit = getModelContextLimit(modelId);
  return Math.floor(limit * CONTEXT_SAFETY_MARGIN);
}

/**
 * Estimate total request tokens (system prompt + messages + tools)
 */
export function estimateRequestTokens(
  systemPrompt: string,
  messages: any[],
  tools?: Record<string, any>
): number {
  let tokens = 0;

  // System prompt
  tokens += estimateTokenCount(systemPrompt);

  // Messages
  tokens += estimateMessagesTokens(messages);

  // Tools
  if (tools) {
    tokens += estimateToolsTokens(tools);
  }

  return tokens;
}

/**
 * Truncate messages to fit within token limit
 * Keeps the most recent messages and system messages
 */
export function truncateMessagesToFit(
  messages: any[],
  maxTokens: number,
  systemPromptTokens: number = 0,
  toolsTokens: number = 0
): any[] {
  const availableTokens = maxTokens - systemPromptTokens - toolsTokens;

  if (availableTokens <= 0) {
    // Not enough tokens even for system prompt and tools
    return [];
  }

  // Separate system messages and other messages
  const systemMessages: any[] = [];
  const otherMessages: any[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemMessages.push(msg);
    } else {
      otherMessages.push(msg);
    }
  }

  // Always keep system messages (they're usually small)
  let usedTokens = estimateMessagesTokens(systemMessages);

  // Keep messages from most recent, working backwards
  const keptMessages: any[] = [...systemMessages];
  const reversedMessages = [...otherMessages].reverse();

  for (const msg of reversedMessages) {
    const msgTokens = estimateMessageTokens(msg);
    if (usedTokens + msgTokens <= availableTokens) {
      keptMessages.unshift(msg); // Add to beginning to maintain order
      usedTokens += msgTokens;
    } else {
      // Can't fit this message, stop
      break;
    }
  }

  // If we had to truncate, add a note
  if (keptMessages.length < messages.length) {
    const truncatedCount = messages.length - keptMessages.length;
    keptMessages.push({
      role: "system",
      content: `[Context truncated: ${truncatedCount} older message(s) removed to fit token limits]`,
    });
  }

  return keptMessages;
}
