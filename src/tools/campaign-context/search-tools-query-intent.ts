import { STRUCTURED_ENTITY_TYPES } from "@/lib/entity-types";

/** Result of parsing a search query for intent (entity type, list-all, planning context, clean query). */
export interface QueryIntent {
  entityType: string | null;
  searchPlanningContext: boolean;
  isListAll: boolean;
  searchQuery: string;
}

/**
 * Parse query string to infer search intent.
 * - Detects entity types in query (e.g., "monsters", "npcs")
 * - Detects planning context intent via "context:" or "session:" prefix
 * - Detects "list all" intent (empty query, just entity type, or "all <type>")
 * - Extracts clean search query for semantic search
 */
export function parseQueryIntent(query: string): QueryIntent {
  const queryTrimmed = query.trim();
  const queryLower = queryTrimmed.toLowerCase();

  // Check for planning context prefix
  const hasContextPrefix =
    queryLower.startsWith("context:") || queryLower.startsWith("session:");
  const searchPlanningContext = hasContextPrefix;

  // Extract query without prefix for further processing
  let queryWithoutPrefix = queryTrimmed;
  if (hasContextPrefix) {
    const colonIndex = queryTrimmed.indexOf(":");
    queryWithoutPrefix = queryTrimmed.substring(colonIndex + 1).trim();
  }

  // Detect entity type in query (whole word matching against structured entity types only).
  // All canonical types come from STRUCTURED_ENTITY_TYPES; no ad-hoc mapping.
  let targetEntityType: string | null = null;
  for (const entityType of STRUCTURED_ENTITY_TYPES) {
    const regex = new RegExp(`\\b${entityType}\\b`, "i");
    if (regex.test(queryWithoutPrefix)) {
      targetEntityType = entityType;
      break;
    }
  }

  // Detect "list all" intent
  let isListAll = false;
  if (queryWithoutPrefix.length === 0) {
    isListAll = true;
  } else if (targetEntityType) {
    const queryLowerNoPrefix = queryWithoutPrefix.toLowerCase();
    const typeLower = targetEntityType.toLowerCase();
    if (
      queryLowerNoPrefix === typeLower ||
      queryLowerNoPrefix === `all ${typeLower}` ||
      queryLowerNoPrefix === `list ${typeLower}` ||
      queryLowerNoPrefix === `list all ${typeLower}`
    ) {
      isListAll = true;
    }
  }

  // Extract clean search query for semantic search
  let searchQuery = queryWithoutPrefix;
  if (targetEntityType && !isListAll) {
    const typeRegex = new RegExp(`\\b${targetEntityType}\\b`, "gi");
    searchQuery = searchQuery.replace(typeRegex, "").trim();
    searchQuery = searchQuery.replace(/^all\s+/i, "").trim();
  }

  return {
    entityType: targetEntityType,
    searchPlanningContext,
    isListAll,
    searchQuery,
  };
}
