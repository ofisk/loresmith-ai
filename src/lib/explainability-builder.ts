import type { ContextSource, Explainability } from "@/types/explainability";

/** Step shape from AI SDK streamText onFinish args */
interface StreamStep {
  toolCalls?: Array<{ toolName: string; args?: unknown }>;
  toolResults?: Array<{
    toolName?: string;
    result?: { success?: boolean; data?: { results?: unknown[] } };
  }>;
}

/**
 * Extract context sources from searchCampaignContext tool result.
 */
function extractContextSourcesFromSearchResults(
  results: unknown[]
): ContextSource[] {
  const sources: ContextSource[] = [];
  for (const r of results) {
    const item = r as Record<string, unknown>;
    const type = item.type as string | undefined;
    const source = item.source as string | undefined;
    if (!type || !source) continue;

    const cs: ContextSource = {
      type: type as ContextSource["type"],
      source: source as ContextSource["source"],
    };
    if (typeof item.entityType === "string") cs.entityType = item.entityType;
    if (typeof item.sessionNumber === "number")
      cs.sessionNumber = item.sessionNumber;
    if (typeof item.sectionType === "string") cs.sectionType = item.sectionType;
    // Use type-specific fields to avoid overwriting: entity/planning use entityId+title, file_content uses fileKey+fileName
    if (type === "file_content") {
      if (typeof item.fileKey === "string") cs.id = item.fileKey;
      if (typeof item.fileName === "string") cs.title = item.fileName;
    } else {
      if (typeof item.entityId === "string") cs.id = item.entityId;
      if (typeof item.title === "string") cs.title = item.title;
    }

    sources.push(cs);
  }
  return sources;
}

/**
 * Build explainability metadata from streamText onFinish steps.
 * Returns null if no context-yielding tools were used.
 */
export function buildExplainabilityFromSteps(
  steps: StreamStep[] | undefined
): Explainability | null {
  if (!steps || steps.length === 0) return null;

  const contextSources: ContextSource[] = [];
  const toolsUsed: string[] = [];

  for (const step of steps) {
    const toolCalls = step.toolCalls ?? [];
    const toolResults = step.toolResults ?? [];

    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i];
      const result = toolResults[i];
      const toolName = call?.toolName;
      if (!toolName) continue;

      toolsUsed.push(toolName);

      if (toolName === "searchCampaignContext" && result?.result?.data) {
        const data = result.result.data as { results?: unknown[] };
        const results = data?.results;
        if (Array.isArray(results) && results.length > 0) {
          contextSources.push(
            ...extractContextSourcesFromSearchResults(results)
          );
        }
      }
    }
  }

  // Only show explainability when we have concrete context sources; hide generic "tools used" fallback
  if (contextSources.length === 0) return null;

  const entityCount = contextSources.filter((s) => s.type === "entity").length;
  const planningCount = contextSources.filter(
    (s) => s.type === "planning_context"
  ).length;
  const fileCount = contextSources.filter(
    (s) => s.type === "file_content"
  ).length;

  const parts: string[] = [];
  if (entityCount > 0)
    parts.push(`${entityCount} entit${entityCount === 1 ? "y" : "ies"}`);
  if (planningCount > 0)
    parts.push(
      `${planningCount} session digest section${planningCount === 1 ? "" : "s"}`
    );
  if (fileCount > 0)
    parts.push(`${fileCount} file chunk${fileCount === 1 ? "" : "s"}`);

  const rationale =
    parts.length > 0
      ? `Based on ${parts.join(", ")} from your campaign.`
      : "Based on tools used during this response.";

  return {
    rationale,
    contextSources,
    toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
  };
}
