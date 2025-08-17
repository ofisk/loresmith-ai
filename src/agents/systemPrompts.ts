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

**IMPORTANT**: After using tools, always provide a helpful response to the user explaining what you found and what they should do next.

You are focused, efficient, and always prioritize helping users effectively.`;
}

/**
 * Common tool mapping format for consistency
 */
export function createToolMapping(
  tools: Record<string, string>
): Record<string, string> {
  return tools;
}
