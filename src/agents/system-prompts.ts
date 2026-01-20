export interface SystemPromptConfig {
  agentName: string;
  responsibilities: string[];
  tools: Record<string, string>;
  workflowGuidelines: string[];
  importantNotes?: string[];
  specialization?: string;
}

/**
 * Extracts tool names from a tools object for safer tool mapping
 */
export function extractToolNames(
  tools: Record<string, any>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tools).map(([key, tool]) => {
      // Use the description as the key and the raw tool name as the value
      let userFriendlyName = key;

      if (tool?.description) {
        // Extract the first sentence or phrase from the description
        const description = tool.description;
        // Look for the first sentence ending with a period, or take the first 50 chars
        const firstSentence = description.match(/^([^.]+)/)?.[1]?.trim();
        if (firstSentence && firstSentence.length > 0) {
          userFriendlyName = firstSentence.toLowerCase();
        }
      }

      return [userFriendlyName, key];
    })
  );
}

/**
 * Creates a tool mapping from tool objects with automatic name extraction
 */
export function createToolMappingFromObjects(
  tools: Record<string, any>
): Record<string, string> {
  return extractToolNames(tools);
}

/**
 * Builds a standardized system prompt for agents
 */
export function buildSystemPrompt(config: SystemPromptConfig): string {
  const toolMappings = Object.entries(config.tools)
    .map(([action, tool]) => `- "${action}" → USE ${tool} tool`)
    .join("\n");

  const responsibilities = config.responsibilities
    .map((responsibility) => `- ${responsibility}`)
    .join("\n");

  const workflowGuidelines = config.workflowGuidelines
    .map((guideline, i) => `${i + 1}. ${guideline}`)
    .join("\n");

  const importantNotes = config.importantNotes
    ? `\n## Important Notes:\n${config.importantNotes.map((note) => `**IMPORTANT**: ${note}`).join("\n")}`
    : "";

  const specialization = config.specialization
    ? `\n## Specialization:\n${config.specialization}`
    : "";

  return `You are a specialized ${config.agentName} for LoreSmith AI.

## Your Responsibilities:
${responsibilities}

## Available Tools:
${toolMappings}

## Workflow Guidelines:
${workflowGuidelines}${importantNotes}${specialization}

## CRITICAL CONVERSATION RULES:
- **NEVER use canned responses, templates, or pre-written text**
- **ALWAYS be conversational, natural, and engaging**
- **Ask questions naturally as part of the conversation flow**
- **Avoid formal structures like "Campaign Name:" or "Campaign Theme:"**
- **Make each interaction feel personal and unique**
- **Use the tools directly when you have enough information - don't ask for more details unless absolutely necessary**
- **CRITICAL - Follow-up Questions and Conversational References: When users make ambiguous references (e.g., 'the next one', 'the first one', 'move to the next X', 'that one', 'these', 'those options'), you MUST use getMessageHistory (if available) to retrieve recent conversation history to understand what they're referring to. Search for messages containing keywords related to the reference (e.g., if user says 'the next faction', search for 'faction' in recent messages). This allows you to understand iterative workflows, lists that were previously discussed, and follow-up questions without overflowing the context window. Only retrieve the most recent relevant messages (limit: 10-20) to keep the context focused.**
- **CRITICAL - NO IMPROVISATION: Base your responses ONLY on information found through tool calls (search results, campaign data, etc.). If tools return zero results or insufficient information, DO NOT improvise, generate, or create new content based on your training data. Instead: (1) Clearly report what you searched for and what you found (or didn't find), (2) Explain that you cannot generate new content without permission, and (3) Ask the user if they would prefer to use existing approved content from their campaign as a first priority, or if they would like you to help create something new. Only generate new content if explicitly requested by the user after you've explained the search results and they've chosen option (b).**

**IMPORTANT**: After using tools, always provide a helpful response to the user explaining what you found and what they should do next.

You are focused, efficient, conversational, and always prioritize helping users effectively through natural dialogue.`;
}

/**
 * Common tool mapping format for consistency
 */
export function createToolMapping(
  tools: Record<string, string>
): Record<string, string> {
  return tools;
}
