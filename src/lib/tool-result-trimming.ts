import { estimateTokenCount } from "./token-utils";
import { getDAOFactory } from "@/dao/dao-factory";

/**
 * Trim tool results by relevancy when they exceed token limits
 * Keeps highest priority items (by score, importance, etc.) and removes lowest priority ones
 */

interface TrimmableResult {
  score?: number;
  entityId?: string;
  [key: string]: unknown;
}

interface ToolResultData {
  results?: TrimmableResult[];
  entities?: TrimmableResult[];
  data?: unknown;
  [key: string]: unknown;
}

/**
 * Estimate tokens in a tool result
 */
function estimateToolResultTokens(result: unknown): number {
  if (!result) return 0;
  const jsonStr = JSON.stringify(result);
  return estimateTokenCount(jsonStr);
}

/**
 * Get priority score for a result item
 * Higher score = higher priority (keep these)
 */
async function getItemPriority(
  item: TrimmableResult,
  env: any,
  campaignId?: string | null
): Promise<number> {
  let priority = 0;

  // Use similarity/relevancy score if available (from semantic search)
  if (typeof item.score === "number") {
    priority += item.score * 100; // Scale to 0-100 range
  } else {
    // Default score for items without explicit score
    priority += 50;
  }

  // Boost priority for entities with high importance scores
  if (item.entityId && campaignId && env?.DB) {
    try {
      const daoFactory = getDAOFactory(env);
      const importance = await daoFactory.entityImportanceDAO.getImportance(
        item.entityId
      );
      if (importance) {
        // Add importance score (0-100) to priority
        priority += importance.importanceScore;
      }
    } catch (error) {
      // Ignore errors - importance lookup is optional
      console.warn(
        `[ToolResultTrimming] Failed to get importance for entity ${item.entityId}:`,
        error
      );
    }
  }

  return priority;
}

/**
 * Trim tool results to fit within token limit, keeping highest priority items
 */
export async function trimToolResultsByRelevancy(
  toolResult: unknown,
  maxTokens: number,
  env: any,
  campaignId?: string | null
): Promise<unknown> {
  // Check if result is trimmable (has results/entities array)
  if (!toolResult || typeof toolResult !== "object") {
    return toolResult;
  }

  const raw = toolResult as Record<string, unknown>;

  // Unwrap envelope format: { toolCallId, result: { success, message, data: { results } } }
  const inner =
    raw.result && typeof raw.result === "object"
      ? (raw.result as Record<string, unknown>)
      : null;
  const payloadToTrim =
    inner && inner.data && typeof inner.data === "object"
      ? (inner.data as ToolResultData)
      : (raw as ToolResultData);

  const result = payloadToTrim as ToolResultData;

  // Find the array to trim (results or entities)
  let itemsToTrim: TrimmableResult[] | undefined;
  let arrayKey: "results" | "entities" | undefined;
  let isNested = false;

  if (Array.isArray(result.results)) {
    itemsToTrim = result.results;
    arrayKey = "results";
  } else if (Array.isArray(result.entities)) {
    itemsToTrim = result.entities;
    arrayKey = "entities";
  } else if (result.data && typeof result.data === "object") {
    const data = result.data as ToolResultData;
    isNested = true;
    if (Array.isArray(data.results)) {
      itemsToTrim = data.results;
      arrayKey = "results";
    } else if (Array.isArray(data.entities)) {
      itemsToTrim = data.entities;
      arrayKey = "entities";
    }
  }

  if (!itemsToTrim || itemsToTrim.length === 0) {
    return toolResult; // Nothing to trim
  }

  // Estimate current token count
  const currentTokens = estimateToolResultTokens(toolResult);

  if (currentTokens <= maxTokens) {
    return toolResult; // Within limit, no trimming needed
  }

  console.log(
    `[ToolResultTrimming] Tool result exceeds token limit: ${currentTokens} > ${maxTokens}. Trimming ${itemsToTrim.length} items by relevancy...`
  );

  // Calculate priority scores for all items
  const itemsWithPriority = await Promise.all(
    itemsToTrim.map(async (item) => ({
      item,
      priority: await getItemPriority(item, env, campaignId),
    }))
  );

  // Sort by priority (highest first)
  itemsWithPriority.sort((a, b) => b.priority - a.priority);

  // Binary search to find how many items we can keep
  let left = 0;
  let right = itemsWithPriority.length;
  let bestCount = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const keptItems = itemsWithPriority.slice(0, mid).map((i) => i.item);

    // Reconstruct result with trimmed items
    const trimmedResult = { ...result };
    if (isNested && result.data && typeof result.data === "object") {
      const trimmedData = { ...(result.data as ToolResultData) };
      if (arrayKey === "results") {
        trimmedData.results = keptItems;
      } else if (arrayKey === "entities") {
        trimmedData.entities = keptItems;
      }
      trimmedResult.data = trimmedData;
    } else {
      if (arrayKey === "results") {
        trimmedResult.results = keptItems;
      } else if (arrayKey === "entities") {
        trimmedResult.entities = keptItems;
      }
    }

    const trimmedTokens = estimateToolResultTokens(trimmedResult);

    if (trimmedTokens <= maxTokens) {
      bestCount = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  // Keep top N items by priority
  const keptItems = itemsWithPriority.slice(0, bestCount).map((i) => i.item);

  const trimmedCount = itemsToTrim.length - keptItems.length;
  console.log(
    `[ToolResultTrimming] Trimmed ${trimmedCount} items (kept ${keptItems.length} highest priority items)`
  );

  // Reconstruct result with trimmed items
  const trimmedPayload = { ...result };
  if (isNested && result.data && typeof result.data === "object") {
    const trimmedData = { ...(result.data as ToolResultData) };
    if (arrayKey === "results") {
      trimmedData.results = keptItems;
    } else if (arrayKey === "entities") {
      trimmedData.entities = keptItems;
    }
    trimmedPayload.data = trimmedData;
  } else {
    if (arrayKey === "results") {
      trimmedPayload.results = keptItems;
    } else if (arrayKey === "entities") {
      trimmedPayload.entities = keptItems;
    }
  }

  // If we unwrapped envelope format, rewrap so the agent gets the same shape
  if (inner) {
    return {
      ...raw,
      result: {
        ...inner,
        data: trimmedPayload,
      },
    };
  }
  return trimmedPayload;
}
