import { getDAOFactory } from "@/dao/dao-factory";
import { estimateTokenCount } from "./token-utils";

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

	// Estimate current token count
	const currentTokens = estimateToolResultTokens(toolResult);

	if (currentTokens <= maxTokens) {
		return toolResult; // Within limit, no trimming needed
	}

	const importanceByEntityId = new Map<string, number>();
	const shouldFetchImportance = Boolean(campaignId && env?.DB);
	if (shouldFetchImportance) {
		try {
			const uniqueEntityIds = Array.from(
				new Set(
					itemsToTrim
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
	const itemsWithPriority = itemsToTrim.map((item) => ({
		item,
		priority: getItemPriority(item, importanceByEntityId),
	}));

	// Sort by priority (highest first)
	itemsWithPriority.sort((a, b) => b.priority - a.priority);

	// Greedy trim: remove lowest-priority items until we fit.
	const keptItems = itemsWithPriority.map((i) => i.item);
	while (keptItems.length > 0) {
		const trimmedPayload = buildTrimmedPayload(
			result,
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
	const emptyPayload = buildTrimmedPayload(result, isNested, arrayKey, []);
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
