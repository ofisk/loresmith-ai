/**
 * Entity content merge and stub detection.
 * Used by staging and pipeline to merge incoming content into existing entities
 * and to mark/clear the isStub flag.
 */

function isNonEmpty(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Deep-merge entity content: prefer non-empty incoming values, keep existing otherwise.
 * - If either is null/undefined, return the other.
 * - For objects: for each key, use incoming[key] if non-empty, else existing[key].
 * - Arrays: replace if incoming is non-empty, else keep existing.
 */
export function mergeEntityContent(
  existing: unknown,
  incoming: unknown
): unknown {
  if (existing == null && incoming == null) return undefined;
  if (incoming == null) return existing;
  if (existing == null) return incoming;

  if (Array.isArray(incoming)) {
    return isNonEmpty(incoming) ? incoming : existing;
  }
  if (
    Array.isArray(existing) &&
    typeof incoming === "object" &&
    incoming !== null &&
    !Array.isArray(incoming)
  ) {
    return incoming;
  }

  if (
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing) &&
    typeof incoming === "object" &&
    incoming !== null &&
    !Array.isArray(incoming)
  ) {
    const result: Record<string, unknown> = {
      ...(existing as Record<string, unknown>),
    };
    const inc = incoming as Record<string, unknown>;
    for (const key of Object.keys(inc)) {
      const incVal = inc[key];
      const existingVal = result[key];
      if (isNonEmpty(incVal)) {
        if (
          typeof incVal === "object" &&
          incVal !== null &&
          !Array.isArray(incVal) &&
          typeof existingVal === "object" &&
          existingVal !== null &&
          !Array.isArray(existingVal)
        ) {
          result[key] = mergeEntityContent(existingVal, incVal);
        } else {
          result[key] = incVal;
        }
      } else if (existingVal !== undefined) {
        result[key] = existingVal;
      }
    }
    return result;
  }

  return isNonEmpty(incoming) ? incoming : existing;
}

const SUMMARY_LIKE_KEYS = [
  "overview",
  "summary",
  "one_line",
  "description",
  "backstory",
];
const MIN_SUBSTANTIVE_LENGTH = 100;

/**
 * Heuristic: content is minimal (stub) if it has very few non-empty fields—
 * e.g. only name/source and at most one short summary-like field.
 */
export function isStubContent(content: unknown, _entityType?: string): boolean {
  if (content == null) return true;
  if (typeof content === "string")
    return content.trim().length < MIN_SUBSTANTIVE_LENGTH;
  if (typeof content !== "object" || Array.isArray(content)) return false;

  const obj = content as Record<string, unknown>;
  const keys = Object.keys(obj).filter(
    (k) => k !== "name" && k !== "source" && k !== "id" && k !== "type"
  );
  let summaryLikeCount = 0;
  let summaryLikeTotalLength = 0;
  let otherNonEmptyCount = 0;

  for (const key of keys) {
    const v = obj[key];
    if (!isNonEmpty(v)) continue;
    if (SUMMARY_LIKE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      summaryLikeCount++;
      if (typeof v === "string") summaryLikeTotalLength += v.length;
      else if (typeof v === "object" && v !== null)
        summaryLikeTotalLength += JSON.stringify(v).length;
    } else {
      otherNonEmptyCount++;
    }
  }

  if (otherNonEmptyCount > 0) return false;
  if (summaryLikeCount === 0) return true;
  if (summaryLikeCount > 1) return false;
  return summaryLikeTotalLength < MIN_SUBSTANTIVE_LENGTH;
}

/**
 * Returns true when the entity is a stub (metadata.isStub === true).
 * Use for filtering stubs out of search, graph, Leiden, and approval UI.
 */
export function isEntityStub(entity: { metadata?: unknown }): boolean {
  const meta = entity.metadata as Record<string, unknown> | undefined;
  return meta?.isStub === true;
}
