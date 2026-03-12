import { getDAOFactory } from "@/dao/dao-factory";
import { estimateTokenCount } from "./token-utils";

/**
 * Trim tool results by relevancy when they exceed token limits
 * Keeps highest priority items (by score, importance, etc.) and removes lowest priority ones
 *
 * Proactive stripping: verbose metadata and redundant fields are removed from each item
 * before the token check, reducing size without dropping items.
 */

/** Max characters per item's text field before truncation. ~1500 tokens at 4 chars/token. */
const MAX_TEXT_CHARS_PER_ITEM = 6000;

/** Verbose fields to strip from result items (redundant or low-value for LLM). */
const VERBOSE_FIELDS_TO_STRIP = new Set([
	"metadata", // Often large JSON; not needed for content understanding
	"relationships", // Redundant when text contains "EXPLICIT ENTITY RELATIONSHIPS"
	// relatedEntities: NOT stripped - planning context needs it for graph linkage
	"campaignMetadata", // Raw JSON blob
	"fileKey", // Internal ID; fileName/title sufficient for display
]);

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
 * Strip verbose metadata and redundant fields from a single result item.
 * Applied proactively before token checks to reduce payload size.
 */
function stripVerboseFieldsFromItem(item: TrimmableResult): TrimmableResult {
	const stripped: TrimmableResult = {};

	for (const [key, value] of Object.entries(item)) {
		if (VERBOSE_FIELDS_TO_STRIP.has(key)) {
			continue; // Omit verbose fields
		}

		// Truncate long text fields
		if (
			key === "text" &&
			typeof value === "string" &&
			value.length > MAX_TEXT_CHARS_PER_ITEM
		) {
			stripped[key] =
				value.slice(0, MAX_TEXT_CHARS_PER_ITEM) +
				"\n\n[truncated for context length]";
			continue;
		}

		stripped[key] = value;
	}

	return stripped;
}

/**
 * Proactively strip verbose fields from all items in a results/entities array.
 * Returns a new payload; does not mutate the input.
 */
function stripVerboseFieldsFromPayload(
	payload: ToolResultData,
	isNested: boolean,
	arrayKey: "results" | "entities"
): ToolResultData {
	const items = (
		isNested && payload.data && typeof payload.data === "object"
			? (payload.data as ToolResultData)[arrayKey]
			: payload[arrayKey]
	) as TrimmableResult[] | undefined;

	if (!Array.isArray(items) || items.length === 0) {
		return payload;
	}

	const strippedItems = items.map(stripVerboseFieldsFromItem);

	const result: ToolResultData = { ...payload };
	if (isNested && payload.data && typeof payload.data === "object") {
		const trimmedData = { ...(payload.data as ToolResultData) };
		trimmedData[arrayKey] = strippedItems;
		result.data = trimmedData;
	} else {
		result[arrayKey] = strippedItems;
	}
	return result;
}

/**
 * Get priority score for a result item
 * Higher score = higher priority (keep these)
 */
function getItemPriority(
	item: TrimmableResult,
	importanceByEntityId: Map<string, number>
): number {
	let priority = 0;

	// Use similarity/relevancy score if available (from semantic search)
	if (typeof item.score === "number") {
		priority += item.score * 100; // Scale to 0-100 range
	} else {
		// Default score for items without explicit score
		priority += 50;
	}

	// Boost priority for entities with high importance scores
	if (item.entityId) {
		priority += importanceByEntityId.get(item.entityId) ?? 0;
	}

	return priority;
}

function buildTrimmedPayload(
	result: ToolResultData,
	isNested: boolean,
	arrayKey: "results" | "entities",
	keptItems: TrimmableResult[]
): ToolResultData {
	const trimmedPayload = { ...result };

	if (isNested && result.data && typeof result.data === "object") {
		const trimmedData = { ...(result.data as ToolResultData) };
		if (arrayKey === "results") {
			trimmedData.results = keptItems;
		} else {
			trimmedData.entities = keptItems;
		}
		trimmedPayload.data = trimmedData;
		return trimmedPayload;
	}

	if (arrayKey === "results") {
		trimmedPayload.results = keptItems;
	} else {
		trimmedPayload.entities = keptItems;
	}
	return trimmedPayload;
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
		inner?.data && typeof inner.data === "object"
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
	if (!arrayKey) {
		return toolResult;
	}

	// Proactive strip: remove verbose metadata and redundant fields from each item.
	// This reduces payload size before we check tokens; may avoid dropping items entirely.
	const strippedPayload = stripVerboseFieldsFromPayload(
		result,
		isNested,
		arrayKey
	);
	const strippedResult = inner
		? {
				...raw,
				result: {
					...inner,
					data: strippedPayload,
				},
			}
		: strippedPayload;

	// Estimate token count after proactive strip
	const currentTokens = estimateToolResultTokens(strippedResult);

	if (currentTokens <= maxTokens) {
		return strippedResult; // Within limit after strip
	}

	// Still over limit: drop lowest-priority items. Use stripped payload as base.
	const strippedItems = (
		isNested && strippedPayload.data && typeof strippedPayload.data === "object"
			? (strippedPayload.data as ToolResultData)[arrayKey]
			: strippedPayload[arrayKey]
	) as TrimmableResult[];

	const importanceByEntityId = new Map<string, number>();
	const shouldFetchImportance = Boolean(campaignId && env?.DB);
	if (shouldFetchImportance) {
		try {
			const uniqueEntityIds = Array.from(
				new Set(
					strippedItems
						.map((item) => item.entityId)
						.filter(
							(entityId): entityId is string => typeof entityId === "string"
						)
				)
			);

			if (uniqueEntityIds.length > 0) {
				const daoFactory = getDAOFactory(env);
				const importanceRecords =
					await daoFactory.entityImportanceDAO.getImportanceByEntityIds(
						uniqueEntityIds
					);
				for (const importance of importanceRecords) {
					importanceByEntityId.set(
						importance.entityId,
						importance.importanceScore
					);
				}
			}
		} catch (error) {
			// Ignore errors - importance lookup is optional.
			console.warn(
				"[ToolResultTrimming] Failed to load batch entity importance:",
				error
			);
		}
	}

	// Calculate priority scores for all items.
	const itemsWithPriority = strippedItems.map((item) => ({
		item,
		priority: getItemPriority(item, importanceByEntityId),
	}));

	// Sort by priority (highest first)
	itemsWithPriority.sort((a, b) => b.priority - a.priority);

	// Greedy trim: remove lowest-priority items until we fit.
	const keptItems = itemsWithPriority.map((i) => i.item);
	while (keptItems.length > 0) {
		const trimmedPayload = buildTrimmedPayload(
			strippedPayload,
			isNested,
			arrayKey,
			keptItems
		);
		const candidateResult = inner
			? {
					...raw,
					result: {
						...inner,
						data: trimmedPayload,
					},
				}
			: trimmedPayload;

		if (estimateToolResultTokens(candidateResult) <= maxTokens) {
			return candidateResult;
		}

		keptItems.pop();
	}

	// Nothing fit within budget; return same shape with an empty result list.
	const emptyPayload = buildTrimmedPayload(
		strippedPayload,
		isNested,
		arrayKey,
		[]
	);
	return inner
		? {
				...raw,
				result: {
					...inner,
					data: emptyPayload,
				},
			}
		: emptyPayload;
}
